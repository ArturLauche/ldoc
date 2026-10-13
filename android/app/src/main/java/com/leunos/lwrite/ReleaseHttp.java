package com.leunos.lwrite;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class ReleaseHttp {
    static final String API = "https://api.github.com/repos/" + UpdatePolicy.REPOSITORY + "/releases?per_page=100";

    static final class Failure extends IOException {
        final String code;
        final long retryAt;
        Failure(String code, long retryAt) { super("Release request failed: " + code); this.code = code; this.retryAt = retryAt; }
    }

    static HttpURLConnection open(String source, long offset) throws IOException {
        // The API URL is a constant; all other initial URLs are built by
        // UpdatePolicy.assetUrl. Only GitHub's HTTPS asset CDN redirects pass.
        if (!source.equals(API) && !source.startsWith("https://github.com/" + UpdatePolicy.REPOSITORY + "/releases/download/")) throw new Failure("release", 0);
        String location = source;
        for (int hop = 0; hop < 6; hop++) {
            if (!source.equals(location) && !UpdatePolicy.trustedRedirect(location)) throw new Failure("release", 0);
            HttpURLConnection connection = (HttpURLConnection) new URL(location).openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(20_000);
            connection.setReadTimeout(30_000);
            connection.setRequestProperty("User-Agent", "LWrite-Android-Updater");
            connection.setRequestProperty("Accept-Encoding", "identity");
            if (source.equals(API)) {
                connection.setRequestProperty("Accept", "application/vnd.github+json");
                connection.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
            }
            if (offset > 0) connection.setRequestProperty("Range", "bytes=" + offset + "-");
            try {
                int status = connection.getResponseCode();
                if (status >= 300 && status <= 308 && status != 304) {
                    String redirect = connection.getHeaderField("Location");
                    if (redirect == null) throw new Failure("release", 0);
                    location = new URL(new URL(location), redirect).toString();
                    connection.disconnect();
                    continue;
                }
                if (status == 403 || status == 429) {
                    long retryAt = System.currentTimeMillis() + 60 * 60 * 1000L;
                    try {
                        String reset = connection.getHeaderField("X-RateLimit-Reset");
                        if (reset != null) retryAt = Long.parseLong(reset) * 1000;
                        String after = connection.getHeaderField("Retry-After");
                        if (after != null) retryAt = System.currentTimeMillis() + Long.parseLong(after) * 1000;
                    } catch (NumberFormatException ignored) { }
                    retryAt = Math.max(System.currentTimeMillis() + 60_000, Math.min(retryAt, System.currentTimeMillis() + 24 * 60 * 60 * 1000L));
                    throw new Failure("rate-limit", retryAt);
                }
                if (status != 200 && status != 206) throw new Failure(status == 404 ? "release" : "network", 0);
                return connection;
            } catch (IOException error) { connection.disconnect(); throw error; }
        }
        throw new Failure("release", 0);
    }

    static String text(String url, long limit) throws IOException {
        HttpURLConnection connection = open(url, 0);
        try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (connection.getResponseCode() != 200) throw new Failure("release", 0);
            FilePolicy.copyBounded(input, output, limit);
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        } finally { connection.disconnect(); }
    }
}
