package com.leunos.lwrite;

import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONArray;
import org.json.JSONObject;

/** Full-APK updates only. Never changes WebView origin, assets or document data. */
@CapacitorPlugin(name = "LWriteUpdater")
public class LWriteUpdaterPlugin extends Plugin {
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private SharedPreferences preferences;
    private PackageInfo installed;
    private volatile ReleaseDescriptor available;
    private volatile String phase = "idle";
    private volatile String error;
    private volatile long downloaded;
    private volatile long total;
    private volatile boolean initialized;

    private boolean development() { return !UpdatePolicy.APPLICATION_ID.equals(getContext().getPackageName()) || BuildConfig.DEBUG; }
    private File directory() {
        // APK cache is deliberately separate from WebView storage and excluded
        // from Android backup. Only files in this directory are ever removed.
        File dir = new File(getContext().getFilesDir(), "updates");
        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Update storage unavailable");
        return dir;
    }
    private File partial() { return new File(directory(), "update.part"); }
    private File apk() { return new File(directory(), "update.apk"); }

    @Override public void load() {
        preferences = getContext().getSharedPreferences("lwrite-apk-updater", android.content.Context.MODE_PRIVATE);
        try { installed = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), ApkTrust.flags()); }
        catch (Exception exception) { phase = "error"; error = "incompatible"; initialized = true; return; }
        if (development()) { phase = "disabled"; initialized = true; return; }
        io.execute(() -> {
            try {
                String manifest = preferences.getString("manifest", null);
                if (manifest != null) {
                    ReleaseDescriptor release = descriptor(new JSONObject(manifest));
                    if (release.code <= ApkTrust.version(installed)) {
                        clearApkCache();
                        preferences.edit().remove("manifest").apply();
                    } else {
                        available = release;
                        total = release.size;
                        if (apk().isFile()) {
                            ApkTrust.verify(getContext().getPackageManager(), installed, apk(), release);
                            downloaded = release.size;
                            phase = "ready";
                        } else downloaded = partial().length();
                    }
                }
            } catch (Exception exception) {
                clearApkCache();
                preferences.edit().remove("manifest").apply();
                phase = "error"; error = "integrity";
            } finally { initialized = true; publish(); }
        });
    }

    private JSObject state() {
        JSObject state = new JSObject().put("installedVersion", installed == null ? "unknown" : installed.versionName)
            .put("installedCode", installed == null ? 0 : ApkTrust.version(installed))
            .put("phase", phase).put("downloadedBytes", downloaded).put("totalBytes", total).put("canInstall", installationAllowed());
        ReleaseDescriptor release = available;
        if (release != null) state.put("availableVersion", release.version).put("availableCode", release.code);
        if (error != null) state.put("error", error);
        long checked = preferences.getLong("lastChecked", 0);
        if (checked > 0) state.put("lastChecked", checked);
        return state;
    }
    private void publish() { notifyListeners("stateChanged", state()); }
    private boolean installationAllowed() { return Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls(); }
    @PluginMethod public void getState(PluginCall call) {
        if (initialized) call.resolve(state());
        else io.execute(() -> call.resolve(state()));
    }

    @PluginMethod public void check(PluginCall call) {
        if (development() || installed == null || busy.get()) { call.resolve(state()); return; }
        boolean manual = call.getBoolean("manual", false);
        if (!manual && System.currentTimeMillis() < preferences.getLong("nextAttemptAt", 0)) { call.resolve(state()); return; }
        if (!busy.compareAndSet(false, true)) { call.resolve(state()); return; }
        phase = "checking"; error = null; publish();
        // Resolve immediately so the editor never waits for a network operation.
        call.resolve(state());
        io.execute(() -> {
            try {
                ReleaseDescriptor candidate = findRelease();
                preferences.edit().putLong("lastChecked", System.currentTimeMillis()).apply();
                if (candidate == null) {
                    if (available != null && apk().isFile()) phase = "ready";
                    else phase = "current";
                } else {
                    if (candidate.minSdk > Build.VERSION.SDK_INT) throw new ReleaseHttp.Failure("incompatible", 0);
                    if (!candidate.certificate.equals(ApkTrust.certificate(installed))) throw new ReleaseHttp.Failure("integrity", 0);
                    if (!candidate.sameArtifact(available)) clearApkCache();
                    available = candidate;
                    total = candidate.size;
                    preferences.edit().putString("manifest", json(candidate).toString()).commit();
                    if (!apk().isFile()) download(candidate);
                    ApkTrust.verify(getContext().getPackageManager(), installed, apk(), candidate);
                    downloaded = total;
                    phase = "ready";
                }
                preferences.edit().putInt("attempts", 0).putLong("nextAttemptAt", System.currentTimeMillis() + UpdatePolicy.CHECK_INTERVAL_MS).apply();
            } catch (Exception exception) {
                String code = exception instanceof ReleaseHttp.Failure ? ((ReleaseHttp.Failure) exception).code : "network";
                error = code; phase = "error";
                if (code.equals("integrity") || code.equals("incompatible")) clearApkCache();
                int attempts = Math.min(8, preferences.getInt("attempts", 0) + 1);
                long next = System.currentTimeMillis() + (code.equals("integrity") || code.equals("incompatible") || code.equals("release") ? UpdatePolicy.CHECK_INTERVAL_MS : UpdatePolicy.retryDelay(attempts));
                if (exception instanceof ReleaseHttp.Failure) next = Math.max(next, ((ReleaseHttp.Failure) exception).retryAt);
                preferences.edit().putInt("attempts", attempts).putLong("nextAttemptAt", next).apply();
            } finally { busy.set(false); publish(); }
        });
    }

    private ReleaseDescriptor findRelease() throws Exception {
        JSONArray releases = new JSONArray(ReleaseHttp.text(ReleaseHttp.API, 2 * 1024 * 1024));
        JSONObject chosen = null;
        int highest = (int) ApkTrust.version(installed);
        for (int i = 0; i < releases.length(); i++) {
            JSONObject release = releases.getJSONObject(i);
            if (release.getBoolean("draft") || release.getBoolean("prerelease")) continue;
            String tag = release.getString("tag_name");
            int code;
            try { code = UpdatePolicy.versionCode(tag); } catch (IOException ignored) { continue; }
            if (code <= highest || !UpdatePolicy.releaseUrl(tag, release.getString("html_url"))) continue;
            JSONArray assets = release.getJSONArray("assets");
            if (!hasAssets(assets, tag)) continue; // Non-Android releases remain valid web releases.
            chosen = release; highest = code;
        }
        if (chosen == null) return null;
        String tag = chosen.getString("tag_name");
        try {
            ReleaseDescriptor candidate = descriptor(new JSONObject(ReleaseHttp.text(UpdatePolicy.assetUrl(tag, UpdatePolicy.MANIFEST_NAME), 16 * 1024)));
            if (!candidate.tag.equals(tag)) throw new IOException("Release tag mismatch");
            String checksum = UpdatePolicy.checksum(ReleaseHttp.text(UpdatePolicy.assetUrl(tag, candidate.apk + ".sha256"), 1024), candidate.apk);
            if (!checksum.equals(candidate.sha256)) throw new ReleaseHttp.Failure("integrity", 0);
            JSONArray assets = chosen.getJSONArray("assets");
            for (int i = 0; i < assets.length(); i++) if (candidate.apk.equals(assets.getJSONObject(i).getString("name")) && assets.getJSONObject(i).getLong("size") != candidate.size) throw new IOException("APK size mismatch");
            return candidate;
        } catch (ReleaseHttp.Failure failure) { throw failure; }
        catch (Exception exception) { throw new ReleaseHttp.Failure("release", 0); }
    }

    private boolean hasAssets(JSONArray assets, String tag) throws Exception {
        String apk = UpdatePolicy.apkName(tag);
        boolean binary = false, checksum = false, manifest = false;
        for (int i = 0; i < assets.length(); i++) {
            JSONObject asset = assets.getJSONObject(i);
            String name = asset.getString("name");
            if (!name.equals(apk) && !name.equals(apk + ".sha256") && !name.equals(UpdatePolicy.MANIFEST_NAME)) continue;
            if (!"uploaded".equals(asset.getString("state")) || !UpdatePolicy.assetUrl(tag, name).equals(asset.getString("browser_download_url"))) throw new ReleaseHttp.Failure("release", 0);
            if (name.equals(apk)) binary = true;
            if (name.equals(apk + ".sha256")) checksum = true;
            if (name.equals(UpdatePolicy.MANIFEST_NAME)) manifest = true;
        }
        return binary && checksum && manifest;
    }

    private ReleaseDescriptor descriptor(JSONObject value) throws Exception {
        if (value.getInt("schemaVersion") != 1) throw new IOException("Unsupported update schema");
        return new ReleaseDescriptor(value.getString("repository"), value.getString("channel"), value.getString("applicationId"),
            value.getString("tag"), value.getString("versionName"), value.getInt("versionCode"), value.getInt("minSdkVersion"), value.getInt("targetSdkVersion"),
            value.getString("apkName"), value.getLong("size"), value.getString("sha256"), value.getString("signingCertificateSha256"));
    }
    private JSONObject json(ReleaseDescriptor value) throws Exception {
        return new JSONObject().put("schemaVersion", 1).put("repository", UpdatePolicy.REPOSITORY).put("channel", "stable").put("applicationId", UpdatePolicy.APPLICATION_ID)
            .put("tag", value.tag).put("versionName", value.version).put("versionCode", value.code).put("minSdkVersion", value.minSdk).put("targetSdkVersion", value.targetSdk)
            .put("apkName", value.apk).put("size", value.size).put("sha256", value.sha256).put("signingCertificateSha256", value.certificate);
    }

    private void download(ReleaseDescriptor release) throws Exception {
        File part = partial();
        if (part.length() > release.size) part.delete();
        long offset = part.length();
        phase = "downloading"; downloaded = offset; publish();
        if (offset < release.size) {
            HttpURLConnection connection = ReleaseHttp.open(UpdatePolicy.assetUrl(release.tag, release.apk), offset);
            try {
                int status = connection.getResponseCode();
                if (status == 206 && !UpdatePolicy.validRange(connection.getHeaderField("Content-Range"), offset, release.size)) throw new ReleaseHttp.Failure("integrity", 0);
                if (status == 200) offset = 0; // Server declined Range; restart safely.
                long announced = connection.getContentLengthLong();
                if (announced != -1 && announced != release.size - offset) throw new ReleaseHttp.Failure("integrity", 0);
                if (directory().getUsableSpace() < release.size - offset + 8 * 1024 * 1024) throw new ReleaseHttp.Failure("storage", 0);
                try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(part, offset > 0)) {
                    byte[] buffer = new byte[64 * 1024];
                    long received = offset, lastEvent = 0;
                    int size;
                    while ((size = input.read(buffer)) != -1) {
                        received += size;
                        if (received > release.size) throw new ReleaseHttp.Failure("integrity", 0);
                        output.write(buffer, 0, size);
                        downloaded = received;
                        if (System.currentTimeMillis() - lastEvent > 250) { publish(); lastEvent = System.currentTimeMillis(); }
                    }
                    output.getFD().sync();
                    if (received != release.size) throw new IOException("Interrupted APK download");
                }
            } finally { connection.disconnect(); }
        }
        ApkTrust.verify(getContext().getPackageManager(), installed, part, release);
        if (!part.renameTo(apk())) throw new ReleaseHttp.Failure("storage", 0);
    }

    private void clearApkCache() { partial().delete(); apk().delete(); downloaded = 0; }

    @PluginMethod public void install(PluginCall call) {
        if (development() || !"ready".equals(phase) || available == null || busy.get()) { call.reject("No verified update available"); return; }
        if (!installationAllowed() && Build.VERSION.SDK_INT >= 26) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            try { startActivityForResult(call, intent, "installationPermission"); }
            catch (Exception exception) { call.reject("Installation settings unavailable", exception); }
            return;
        }
        launchInstaller(call);
    }

    @ActivityCallback private void installationPermission(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (installationAllowed()) launchInstaller(call);
        else call.resolve(new JSObject().put("permissionRequired", true));
    }

    private void launchInstaller(PluginCall call) {
        io.execute(() -> {
            try {
                ReleaseDescriptor release = available;
                if (release == null || !installationAllowed()) throw new IOException("Installation not authorized");
                // Recheck on every install attempt, including after Android settings.
                ApkTrust.verify(getContext().getPackageManager(), installed, apk(), release);
                getActivity().runOnUiThread(() -> {
                    try {
                        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk());
                        Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION).setClipData(ClipData.newRawUri("LWrite update", uri));
                        getActivity().startActivity(intent);
                        call.resolve(new JSObject().put("permissionRequired", false));
                    } catch (Exception exception) { call.reject("Installer unavailable", exception); }
                });
            } catch (Exception exception) {
                error = exception instanceof ReleaseHttp.Failure ? ((ReleaseHttp.Failure) exception).code : "installer";
                phase = "error"; publish(); call.reject("Update verification or installer failed", exception);
            }
        });
    }
    @Override protected void handleOnResume() { if (initialized) publish(); }
    @Override protected void handleOnDestroy() { io.shutdown(); }
}
