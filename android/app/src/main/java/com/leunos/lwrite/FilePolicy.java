package com.leunos.lwrite;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Map;
import java.util.HashMap;

/** Native ingress uses the same document/image limits as the React application. */
final class FilePolicy {
    static final long DOCUMENT_LIMIT = 20L * 1024 * 1024;
    static final long IMAGE_LIMIT = 10L * 1024 * 1024;
    static final long EXPORT_LIMIT = 256L * 1024 * 1024;
    static final int CHUNK_BYTES = 192 * 1024;
    private static final Map<String, String> EXTENSIONS = new HashMap<>();
    static {
        EXTENSIONS.put("text/plain", "txt"); EXTENSIONS.put("text/html", "html");
        EXTENSIONS.put("application/rtf", "rtf"); EXTENSIONS.put("text/rtf", "rtf");
        EXTENSIONS.put("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx");
        EXTENSIONS.put("application/vnd.oasis.opendocument.text", "odt");
        EXTENSIONS.put("application/vnd.oasis.opendocument.text-template", "ott");
        EXTENSIONS.put("application/vnd.oasis.opendocument.text-flat-xml", "fodt");
        EXTENSIONS.put("application/json", "json");
    }

    static String safeName(String name) {
        String clean = name == null ? "document" : name.replaceAll("[\\p{Cntrl}/\\\\]", "_").trim();
        if (clean.isEmpty() || clean.equals(".") || clean.equals("..")) clean = "document";
        return clean.length() > 200 ? clean.substring(0, 180) + extensionSuffix(clean) : clean;
    }

    private static String extensionSuffix(String name) {
        int dot = name.lastIndexOf('.');
        return dot >= 0 && name.length() - dot <= 16 ? name.substring(dot) : "";
    }

    static String importName(String name, String mime, String kind) throws IOException {
        String safe = safeName(name);
        if (kind.equals("image")) {
            if (mime == null || !mime.startsWith("image/")) throw new IOException("Not an image");
            return safe;
        }
        String suffix = extensionSuffix(safe).toLowerCase(Locale.ROOT);
        String allowed = kind.equals("library") ? "json" : "txt|html|htm|rtf|docx|odt|ott|fodt" + (kind.equals("mixed") ? "|json" : "");
        if (suffix.matches("\\.(" + allowed + ")")) return safe;
        // Some providers supply a display name without an extension. Known MIME
        // types can supply it; a conflicting explicit extension is rejected.
        String inferred = EXTENSIONS.get(mime == null ? "" : mime.toLowerCase(Locale.ROOT));
        if (suffix.isEmpty() && inferred != null && inferred.matches(allowed)) return safe + "." + inferred;
        throw new IOException("Unsupported document type");
    }

    static long copyBounded(InputStream input, OutputStream output, long limit) throws IOException {
        byte[] buffer = new byte[32 * 1024];
        long total = 0;
        int length;
        while ((length = input.read(buffer)) != -1) {
            total += length;
            if (total > limit) throw new IOException("File exceeds size limit");
            output.write(buffer, 0, length);
        }
        return total;
    }

    static File prepareSharedFile(File staged, File targetDirectory, String name) throws IOException {
        if (!staged.isFile()) throw new IOException("Export staging file is missing");
        if (!targetDirectory.isDirectory() && !targetDirectory.mkdir()) throw new IOException("Unable to prepare shared file");
        File target = new File(targetDirectory, safeName(name));
        if (target.exists() || !staged.renameTo(target)) {
            targetDirectory.delete();
            throw new IOException("Unable to move shared file");
        }
        return target;
    }

    static void deleteSharedFile(File target) {
        if (target.delete()) target.getParentFile().delete();
    }

    /** Shared recipients need the named file after the chooser has returned. */
    static void expireFiles(File directory, long cutoff) {
        File[] entries = directory.listFiles();
        if (entries == null) return;
        for (File entry : entries) if (entry.lastModified() < cutoff) {
            if (entry.isDirectory()) {
                File[] children = entry.listFiles();
                if (children != null) for (File child : children) child.delete();
            }
            entry.delete();
        }
    }

    static String readText(File file) throws IOException {
        try (InputStream input = new FileInputStream(file); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            copyBounded(input, output, 16 * 1024);
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}
