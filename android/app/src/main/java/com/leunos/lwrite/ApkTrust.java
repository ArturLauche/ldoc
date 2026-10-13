package com.leunos.lwrite;

import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.security.MessageDigest;

final class ApkTrust {
    static int flags() { return Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES; }
    static long version(PackageInfo info) { return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode; }
    static Signature[] signatures(PackageInfo info) {
        return Build.VERSION.SDK_INT >= 28 && info.signingInfo != null ? info.signingInfo.getApkContentsSigners() : info.signatures;
    }
    static String hex(byte[] value) {
        StringBuilder output = new StringBuilder(value.length * 2);
        for (byte item : value) output.append(String.format(java.util.Locale.ROOT, "%02x", item & 0xff));
        return output.toString();
    }
    static String certificate(PackageInfo info) throws Exception {
        Signature[] signatures = signatures(info);
        if (signatures == null || signatures.length != 1) throw new IOException("Expected a single permanent release signer");
        return hex(MessageDigest.getInstance("SHA-256").digest(signatures[0].toByteArray()));
    }
    static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[64 * 1024];
            int size;
            while ((size = input.read(buffer)) != -1) digest.update(buffer, 0, size);
        }
        return hex(digest.digest());
    }
    static void verify(PackageManager manager, PackageInfo installed, File file, ReleaseDescriptor release) throws Exception {
        if (file.length() != release.size || !sha256(file).equals(release.sha256)) throw new ReleaseHttp.Failure("integrity", 0);
        PackageInfo archive = manager.getPackageArchiveInfo(file.getAbsolutePath(), flags());
        if (archive == null || archive.applicationInfo == null || !UpdatePolicy.APPLICATION_ID.equals(archive.packageName) ||
            !release.version.equals(archive.versionName) || version(archive) != release.code || version(archive) <= version(installed) ||
            archive.applicationInfo.minSdkVersion != release.minSdk || archive.applicationInfo.targetSdkVersion != release.targetSdk ||
            archive.applicationInfo.minSdkVersion > Build.VERSION.SDK_INT || (archive.applicationInfo.flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) throw new ReleaseHttp.Failure("incompatible", 0);
        if (!certificate(archive).equals(certificate(installed)) || !certificate(archive).equals(release.certificate)) throw new ReleaseHttp.Failure("integrity", 0);
    }
}
