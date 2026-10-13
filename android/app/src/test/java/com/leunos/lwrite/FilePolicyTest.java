package com.leunos.lwrite;

import static org.junit.Assert.*;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.File;
import java.nio.file.Files;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class FilePolicyTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();
    @Test public void unknownStreamSizesAreBoundedWhileReading() throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        assertEquals(3, FilePolicy.copyBounded(new ByteArrayInputStream(new byte[]{1, 2, 3}), output, 3));
        assertArrayEquals(new byte[]{1, 2, 3}, output.toByteArray());
        assertThrows(IOException.class, () -> FilePolicy.copyBounded(new ByteArrayInputStream(new byte[4]), new ByteArrayOutputStream(), 3));
    }
    @Test public void namesCannotEscapeTheStagingDirectory() {
        assertEquals(".._.._report.txt", FilePolicy.safeName("../../report.txt"));
        assertEquals("report_.txt", FilePolicy.safeName("report\u0000.txt"));
        assertEquals("document", FilePolicy.safeName(".."));
    }
    @Test public void mimeTypesOnlyInferMissingExtensions() throws Exception {
        assertEquals("Report.docx", FilePolicy.importName("Report", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "document"));
        assertEquals("Report.ODT", FilePolicy.importName("Report.ODT", "application/octet-stream", "document"));
        assertEquals("library.lwrite.json", FilePolicy.importName("library.lwrite.json", "application/octet-stream", "library"));
        assertThrows(IOException.class, () -> FilePolicy.importName("malware.apk", "text/plain", "document"));
        assertThrows(IOException.class, () -> FilePolicy.importName("file.pdf", "application/pdf", "document"));
        assertThrows(IOException.class, () -> FilePolicy.importName("file.json", "application/json", "document"));
        assertThrows(IOException.class, () -> FilePolicy.importName("file.txt", "text/plain", "library"));
        assertThrows(IOException.class, () -> FilePolicy.importName("file", "application/octet-stream", "mixed"));
    }
    @Test public void sharingMovesThePayloadAndPrintingCanReleaseIt() throws Exception {
        File staged = temporary.newFile("staged.bin");
        Files.write(staged.toPath(), new byte[]{1, 2, 3});
        File sharedDirectory = new File(temporary.getRoot(), "share");
        File target = FilePolicy.prepareSharedFile(staged, sharedDirectory, "report.txt");
        assertFalse("Do not keep a second copy of a large export", staged.exists());
        assertArrayEquals(new byte[]{1, 2, 3}, Files.readAllBytes(target.toPath()));
        FilePolicy.deleteSharedFile(target);
        assertFalse(target.exists());
        assertFalse(sharedDirectory.exists());
    }
    @Test public void expiryRemovesSharedDirectoriesAndStagingButPreservesFreshRecipients() throws Exception {
        File expired = temporary.newFolder("expired-share");
        Files.write(new File(expired, "report.pdf").toPath(), new byte[]{1});
        File metadata = temporary.newFile("expired.json");
        assertTrue(expired.setLastModified(1000));
        assertTrue(metadata.setLastModified(1000));
        File fresh = temporary.newFolder("fresh-share");
        File freshDocument = new File(fresh, "report.txt");
        Files.write(freshDocument.toPath(), new byte[]{2});
        FilePolicy.expireFiles(temporary.getRoot(), 2000);
        assertFalse(expired.exists());
        assertFalse(metadata.exists());
        assertTrue(freshDocument.exists());
    }
}
