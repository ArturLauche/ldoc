package com.leunos.lwrite;

import static org.junit.Assert.*;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import org.junit.Test;

public class FilePolicyTest {
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
}
