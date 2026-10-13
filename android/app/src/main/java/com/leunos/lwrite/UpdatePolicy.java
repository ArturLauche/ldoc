package com.leunos.lwrite;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.Set;
import java.util.HashSet;
import java.util.Arrays;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** No Android dependencies: release trust and version rules are unit tested. */
final class UpdatePolicy {
    static final String REPOSITORY = "ArturLauche/ldoc";
    static final String APPLICATION_ID = "com.leunos.lwrite";
    static final String MANIFEST_NAME = "LWrite-Android-update.json";
    static final long APK_LIMIT = 128L * 1024 * 1024;
    static final long CHECK_INTERVAL_MS = 6L * 60 * 60 * 1000;
    private static final Pattern TAG = Pattern.compile("^v(0|[1-9][0-9]{0,3})\\.(0|[1-9][0-9]{0,2})\\.(0|[1-9][0-9]{0,2})$");
    private static final Set<String> REDIRECT_HOSTS = new HashSet<>(Arrays.asList("github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"));

    static int versionCode(String tag) throws IOException {
        Matcher matcher = TAG.matcher(tag);
        if (!matcher.matches()) throw new IOException("Invalid stable version tag");
        int major = Integer.parseInt(matcher.group(1));
        int minor = Integer.parseInt(matcher.group(2));
        int patch = Integer.parseInt(matcher.group(3));
        long code = major * 1_000_000L + minor * 1_000L + patch;
        if (major > 2000 || code < 1) throw new IOException("Version outside supported range");
        return (int) code;
    }

    static String apkName(String tag) throws IOException {
        versionCode(tag);
        return "LWrite-Android-" + tag + ".apk";
    }

    static String assetUrl(String tag, String asset) throws IOException {
        String apk = apkName(tag);
        if (!asset.equals(apk) && !asset.equals(apk + ".sha256") && !asset.equals(MANIFEST_NAME)) throw new IOException("Unexpected release asset");
        return "https://github.com/" + REPOSITORY + "/releases/download/" + tag + "/" + asset;
    }

    static boolean releaseUrl(String tag, String url) {
        return ("https://github.com/" + REPOSITORY + "/releases/tag/" + tag).equals(url);
    }

    static boolean trustedRedirect(String value) {
        try {
            URI uri = new URI(value);
            return "https".equals(uri.getScheme()) && uri.getUserInfo() == null && uri.getFragment() == null &&
                (uri.getPort() == -1 || uri.getPort() == 443) && REDIRECT_HOSTS.contains(uri.getHost());
        } catch (URISyntaxException error) { return false; }
    }

    static String checksum(String text, String name) throws IOException {
        Matcher matcher = Pattern.compile("^([a-fA-F0-9]{64})  " + Pattern.quote(name) + "\\r?\\n?$").matcher(text);
        if (!matcher.matches()) throw new IOException("Invalid published checksum");
        return matcher.group(1).toLowerCase(java.util.Locale.ROOT);
    }

    static long retryDelay(int attempts) {
        return Math.min(CHECK_INTERVAL_MS, 15L * 60 * 1000 * (1L << Math.max(0, Math.min(5, attempts - 1))));
    }

    static boolean validRange(String value, long offset, long total) {
        if (value == null) return false;
        Matcher matcher = Pattern.compile("^bytes ([0-9]+)-([0-9]+)/([0-9]+)$").matcher(value);
        if (!matcher.matches()) return false;
        try {
            return Long.parseLong(matcher.group(1)) == offset && Long.parseLong(matcher.group(2)) == total - 1 && Long.parseLong(matcher.group(3)) == total;
        } catch (NumberFormatException error) { return false; }
    }
}
