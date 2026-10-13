package com.leunos.lwrite;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

@CapacitorPlugin(name = "LWriteFiles")
public class LWriteFilesPlugin extends Plugin {
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final AtomicBoolean pickerOpen = new AtomicBoolean(false);
    private static final long EXPIRY_MS = 7L * 24 * 60 * 60 * 1000;
    private String incomingError;

    private File directory() {
        File dir = new File(getContext().getCacheDir(), "lwrite-files");
        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Temporary storage unavailable");
        return dir;
    }

    private File file(String id, String suffix) throws IOException {
        if (id == null || !id.matches("[a-f0-9-]{36}") || !UUID.fromString(id).toString().equals(id)) throw new IOException("Invalid file token");
        return new File(directory(), id + suffix);
    }

    private JSONObject metadata(String id) throws Exception {
        return new JSONObject(FilePolicy.readText(file(id, ".json")));
    }

    private void storeMetadata(String id, JSONObject value) throws Exception {
        try (FileOutputStream stream = new FileOutputStream(file(id, ".json"))) {
            stream.write(value.toString().getBytes(StandardCharsets.UTF_8));
            stream.getFD().sync();
        }
    }

    @Override public void load() {
        io.execute(() -> {
            File[] files = directory().listFiles();
            if (files != null) for (File entry : files) if (entry.lastModified() < System.currentTimeMillis() - EXPIRY_MS) {
                if (entry.isDirectory()) {
                    File[] children = entry.listFiles();
                    if (children != null) for (File child : children) child.delete();
                }
                entry.delete();
            }
        });
        receiveIntent(getActivity().getIntent());
    }

    @Override protected void handleOnNewIntent(Intent intent) { receiveIntent(intent); }

    private void receiveIntent(Intent intent) {
        String action = intent.getAction();
        if (!Intent.ACTION_VIEW.equals(action) && !Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return;
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) uris.add(intent.getData());
        if (Intent.ACTION_SEND.equals(action)) {
            Uri uri = Build.VERSION.SDK_INT >= 33 ? intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class) : intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) uris.add(uri);
        }
        if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> streams = Build.VERSION.SDK_INT >= 33 ? intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class) : intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (streams != null) uris.addAll(streams);
        }
        // Copy while the caller's transient URI grant is valid. Do not retain
        // filesystem paths or request broad storage permissions.
        io.execute(() -> {
            try {
                if (uris.size() > 16) throw new IOException("Too many incoming files");
                for (Uri uri : uris) stage(uri, "mixed", true);
            } catch (Exception error) { incomingError = "Unable to open received document"; }
            notifyListeners("incomingFiles", new JSObject(), true);
        });
        // Avoid importing the launch intent again after activity recreation.
        getActivity().setIntent(new Intent(getContext(), MainActivity.class).setAction(Intent.ACTION_MAIN));
    }

    private JSObject stage(Uri uri, String kind, boolean incoming) throws Exception {
        if (!"content".equals(uri.getScheme())) throw new IOException("Only granted content URIs are accepted");
        String mime = getContext().getContentResolver().getType(uri);
        String name = null;
        long announced = -1;
        try (Cursor cursor = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameColumn = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int sizeColumn = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (nameColumn >= 0) name = cursor.getString(nameColumn);
                if (sizeColumn >= 0 && !cursor.isNull(sizeColumn)) announced = cursor.getLong(sizeColumn);
            }
        }
        name = FilePolicy.importName(name, mime, kind);
        long limit = kind.equals("image") ? FilePolicy.IMAGE_LIMIT : FilePolicy.DOCUMENT_LIMIT;
        if (announced > limit) throw new IOException("File exceeds size limit");
        String id = UUID.randomUUID().toString();
        try {
            long size;
            try (InputStream input = getContext().getContentResolver().openInputStream(uri); FileOutputStream output = new FileOutputStream(file(id, ".bin"))) {
                if (input == null) throw new IOException("Content provider returned no data");
                size = FilePolicy.copyBounded(input, output, limit);
                output.getFD().sync();
            }
            JSObject value = new JSObject().put("id", id).put("name", name).put("mimeType", mime == null ? "application/octet-stream" : mime).put("size", size).put("incoming", incoming);
            storeMetadata(id, value);
            return value;
        } catch (Exception error) {
            remove(id);
            throw error;
        }
    }

    @PluginMethod public void pickFiles(PluginCall call) {
        if (!pickerOpen.compareAndSet(false, true)) { call.reject("A file picker is already open"); return; }
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image".equals(call.getString("kind")) ? "image/*" : "*/*");
        // Providers often mislabel RTF, FODT and JSON; extensions and content
        // remain validated after selection, including unknown stream lengths.
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, call.getBoolean("multiple", false));
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try { startActivityForResult(call, intent, "picked"); }
        catch (Exception error) { pickerOpen.set(false); call.reject("No document picker available", error); }
    }

    @ActivityCallback private void picked(PluginCall call, ActivityResult result) {
        pickerOpen.set(false);
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) { call.resolve(new JSObject().put("files", new JSArray())); return; }
        Intent data = result.getData();
        List<Uri> uris = new ArrayList<>();
        if (data.getClipData() != null) for (int i = 0; i < data.getClipData().getItemCount(); i++) uris.add(data.getClipData().getItemAt(i).getUri());
        else if (data.getData() != null) uris.add(data.getData());
        io.execute(() -> {
            JSArray files = new JSArray();
            List<String> staged = new ArrayList<>();
            try {
                if (uris.size() > 16) throw new IOException("Select at most 16 files at a time");
                for (Uri uri : uris) {
                    JSObject item = stage(uri, call.getString("kind", "document"), false);
                    staged.add(item.getString("id"));
                    files.put(item);
                }
                call.resolve(new JSObject().put("files", files));
            } catch (Exception error) {
                for (String id : staged) remove(id);
                call.reject("Document selection failed", error);
            }
        });
    }

    @PluginMethod public void pendingFiles(PluginCall call) {
        io.execute(() -> {
            JSArray files = new JSArray();
            File[] entries = directory().listFiles((dir, name) -> name.endsWith(".json"));
            if (entries != null) for (File entry : entries) {
                try {
                    String id = entry.getName().replace(".json", "");
                    JSONObject value = metadata(id);
                    if (value.optBoolean("incoming") && file(id, ".bin").exists()) files.put(value);
                } catch (Exception ignored) { /* An incomplete staging file is never imported. */ }
            }
            JSObject value = new JSObject().put("files", files);
            if (incomingError != null) { value.put("error", incomingError); incomingError = null; }
            call.resolve(value);
        });
    }

    @PluginMethod public void readChunk(PluginCall call) {
        io.execute(() -> {
            try (RandomAccessFile input = new RandomAccessFile(file(call.getString("id"), ".bin"), "r")) {
                long offset = call.getLong("offset", -1L);
                if (offset < 0 || offset > input.length()) throw new IOException("Invalid offset");
                input.seek(offset);
                byte[] buffer = new byte[(int) Math.min(FilePolicy.CHUNK_BYTES, input.length() - offset)];
                input.readFully(buffer);
                call.resolve(new JSObject().put("data", Base64.encodeToString(buffer, Base64.NO_WRAP)));
            } catch (Exception error) { call.reject("Unable to read document", error); }
        });
    }

    @PluginMethod public void beginExport(PluginCall call) {
        io.execute(() -> {
            String id = UUID.randomUUID().toString();
            try {
                long size = call.getLong("size", -1L);
                String mime = call.getString("mimeType", "application/octet-stream");
                if (size < 0 || size > FilePolicy.EXPORT_LIMIT || !mime.matches("[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+")) throw new IOException("Invalid export");
                try (FileOutputStream ignored = new FileOutputStream(file(id, ".bin"))) { }
                storeMetadata(id, new JSONObject().put("id", id).put("name", FilePolicy.safeName(call.getString("name"))).put("mimeType", mime).put("size", size).put("export", true));
                call.resolve(new JSObject().put("id", id));
            } catch (Exception error) { remove(id); call.reject("Unable to stage export", error); }
        });
    }

    @PluginMethod public void writeChunk(PluginCall call) {
        io.execute(() -> {
            try {
                String id = call.getString("id");
                JSONObject meta = metadata(id);
                String encoded = call.getString("data", "");
                if (encoded.length() > FilePolicy.CHUNK_BYTES * 4 / 3 + 4 || !meta.optBoolean("export")) throw new IOException("Invalid chunk");
                byte[] bytes = Base64.decode(encoded, Base64.NO_WRAP);
                try (RandomAccessFile output = new RandomAccessFile(file(id, ".bin"), "rw")) {
                    long offset = call.getLong("offset", -1L);
                    if (offset != output.length() || offset + bytes.length > meta.getLong("size")) throw new IOException("Invalid export offset");
                    output.seek(offset);
                    output.write(bytes);
                }
                call.resolve();
            } catch (Exception error) { call.reject("Unable to write export", error); }
        });
    }

    @PluginMethod public void finishExport(PluginCall call) {
        io.execute(() -> {
            try {
                String id = call.getString("id");
                JSONObject meta = metadata(id);
                if (file(id, ".bin").length() != meta.getLong("size") || !meta.optBoolean("export")) throw new IOException("Export is incomplete");
                String action = call.getString("action");
                File targetDir = new File(directory(), id);
                File sharedTarget = new File(targetDir, meta.getString("name"));
                if ("share".equals(action) || "print".equals(action)) {
                    if (!targetDir.exists() && !targetDir.mkdir()) throw new IOException("Unable to prepare shared file");
                    try (InputStream input = new FileInputStream(file(id, ".bin")); OutputStream output = new FileOutputStream(sharedTarget)) {
                        FilePolicy.copyBounded(input, output, FilePolicy.EXPORT_LIMIT);
                    }
                }
                getActivity().runOnUiThread(() -> {
                    try {
                        if ("save".equals(action)) {
                            if (!pickerOpen.compareAndSet(false, true)) throw new IOException("A file picker is already open");
                            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(meta.getString("mimeType"));
                            intent.putExtra(Intent.EXTRA_TITLE, meta.getString("name"));
                            try { startActivityForResult(call, intent, "saved"); }
                            catch (Exception error) { pickerOpen.set(false); throw error; }
                        } else if ("share".equals(action) || "print".equals(action)) {
                            if ("print".equals(action)) {
                                if (!"application/pdf".equals(meta.getString("mimeType"))) throw new IOException("Printing requires PDF");
                                NativePdfPrinter.print(getActivity(), sharedTarget, meta.getString("name"));
                            } else {
                                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", sharedTarget);
                                Intent intent = new Intent(Intent.ACTION_SEND).setType(meta.getString("mimeType")).putExtra(Intent.EXTRA_STREAM, uri)
                                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                intent.setClipData(ClipData.newRawUri(meta.getString("name"), uri));
                                getActivity().startActivity(Intent.createChooser(intent, null));
                            }
                            call.resolve(new JSObject().put("completed", true));
                        } else throw new IOException("Unknown export action");
                    } catch (Exception error) { call.reject("Unable to deliver export", error); }
                });
            } catch (Exception error) { call.reject("Unable to prepare export", error); }
        });
    }

    @ActivityCallback private void saved(PluginCall call, ActivityResult result) {
        pickerOpen.set(false);
        if (call == null) return;
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) { call.resolve(new JSObject().put("completed", false)); return; }
        io.execute(() -> {
            try {
                try (InputStream input = new FileInputStream(file(call.getString("id"), ".bin")); OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                    if (output == null) throw new IOException("Destination unavailable");
                    FilePolicy.copyBounded(input, output, FilePolicy.EXPORT_LIMIT);
                    output.flush();
                }
                call.resolve(new JSObject().put("completed", true));
            } catch (Exception error) { call.reject("Unable to save export", error); }
        });
    }

    private void remove(String id) {
        try {
            file(id, ".bin").delete();
            file(id, ".json").delete();
        } catch (IOException ignored) { }
    }
    @PluginMethod public void releaseFile(PluginCall call) { io.execute(() -> { remove(call.getString("id")); call.resolve(); }); }
    @Override protected void handleOnDestroy() { io.shutdown(); }
}
