package com.leunos.lwrite;

import java.io.IOException;

final class ReleaseDescriptor {
    final String tag;
    final String version;
    final int code;
    final int minSdk;
    final int targetSdk;
    final String apk;
    final long size;
    final String sha256;
    final String certificate;

    ReleaseDescriptor(String repository, String channel, String applicationId, String tag, String version, int code, int minSdk, int targetSdk, String apk, long size, String sha256, String certificate) throws IOException {
        if (!UpdatePolicy.REPOSITORY.equals(repository) || !"stable".equals(channel) || !UpdatePolicy.APPLICATION_ID.equals(applicationId) ||
            code != UpdatePolicy.versionCode(tag) || !tag.substring(1).equals(version) || !UpdatePolicy.apkName(tag).equals(apk) ||
            minSdk < 24 || targetSdk < 36 || minSdk > targetSdk || size < 1 || size > UpdatePolicy.APK_LIMIT ||
            !sha256.matches("[a-f0-9]{64}") || !certificate.matches("[a-f0-9]{64}")) throw new IOException("Invalid Android release metadata");
        this.tag = tag; this.version = version; this.code = code; this.minSdk = minSdk; this.targetSdk = targetSdk;
        this.apk = apk; this.size = size; this.sha256 = sha256; this.certificate = certificate;
    }

    boolean sameArtifact(ReleaseDescriptor other) {
        return other != null && tag.equals(other.tag) && size == other.size && sha256.equals(other.sha256) && certificate.equals(other.certificate);
    }
}
