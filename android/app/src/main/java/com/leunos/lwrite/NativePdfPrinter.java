package com.leunos.lwrite;

import android.app.Activity;
import android.content.Context;
import android.graphics.pdf.PdfRenderer;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class NativePdfPrinter {
    static void print(Activity activity, File file, String name) {
        PrintManager manager = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
        if (manager == null) throw new IllegalStateException("Printing is unavailable");
        manager.print(name, new PrintDocumentAdapter() {
            private final ExecutorService io = Executors.newSingleThreadExecutor();
            @Override public void onLayout(PrintAttributes oldAttributes, PrintAttributes newAttributes, CancellationSignal cancellation, LayoutResultCallback callback, android.os.Bundle extras) {
                io.execute(() -> {
                    if (cancellation.isCanceled()) { callback.onLayoutCancelled(); return; }
                    try (ParcelFileDescriptor descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY); PdfRenderer renderer = new PdfRenderer(descriptor)) {
                        callback.onLayoutFinished(new PrintDocumentInfo.Builder(name).setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).setPageCount(renderer.getPageCount()).build(), !newAttributes.equals(oldAttributes));
                    } catch (Exception error) { callback.onLayoutFailed("Could not prepare PDF"); }
                });
            }
            @Override public void onWrite(PageRange[] pages, ParcelFileDescriptor destination, CancellationSignal cancellation, WriteResultCallback callback) {
                io.execute(() -> {
                    try (FileInputStream input = new FileInputStream(file); FileOutputStream output = new FileOutputStream(destination.getFileDescriptor())) {
                        byte[] buffer = new byte[32 * 1024];
                        int size;
                        while ((size = input.read(buffer)) != -1) {
                            if (cancellation.isCanceled()) { callback.onWriteCancelled(); return; }
                            output.write(buffer, 0, size);
                        }
                        // The Android print spooler applies the requested page ranges.
                        callback.onWriteFinished(new PageRange[]{PageRange.ALL_PAGES});
                    } catch (Exception error) { callback.onWriteFailed("Could not print PDF"); }
                });
            }
            @Override public void onFinish() {
                io.execute(() -> FilePolicy.deleteSharedFile(file));
                io.shutdown();
            }
        }, null);
    }
}
