package com.leunos.lwrite;

import static org.junit.Assert.*;
import android.content.Intent;
import android.webkit.WebView;
import android.content.Context;
import android.net.Uri;
import androidx.core.content.FileProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Runs against the real bundled WebView, not a mocked browser or hosted URL. */
@RunWith(AndroidJUnit4.class)
public class OfflineEditorTest {
    static MainActivity launch() {
        Intent intent = new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(), MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return (MainActivity) InstrumentationRegistry.getInstrumentation().startActivitySync(intent);
    }
    static String evaluate(MainActivity activity, String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> activity.getBridge().getWebView().evaluateJavascript(script, value -> { result.set(value); done.countDown(); }));
        assertTrue("WebView JavaScript callback", done.await(10, TimeUnit.SECONDS));
        return result.get();
    }
    static void waitForEditor(MainActivity activity) throws Exception {
        long deadline = System.currentTimeMillis() + 30_000;
        do {
            if ("true".equals(evaluate(activity, "Boolean(document.querySelector('.ProseMirror[contenteditable=true]'))"))) return;
            Thread.sleep(200);
        } while (System.currentTimeMillis() < deadline);
        fail("Bundled editor did not become editable");
    }
    @Test public void bundledEditorAndIndexedDbSurviveAWebViewReload() throws Exception {
        MainActivity activity = launch();
        waitForEditor(activity);
        assertEquals("\"https://localhost/\"", evaluate(activity, "location.href"));
        assertEquals("true", evaluate(activity, "Boolean(window.indexedDB && window.Capacitor.isNativePlatform())"));
        String marker = "native-reload-" + System.currentTimeMillis();
        // A distinct test database avoids mutating the user's document records.
        evaluate(activity, "window.__storageResult = null; (() => { const r=indexedDB.open('lwrite-native-test',1); r.onupgradeneeded=()=>r.result.createObjectStore('probe'); r.onsuccess=()=>{ const db=r.result;const t=db.transaction('probe','readwrite');t.objectStore('probe').put('" + marker + "','marker');t.oncomplete=()=>{ db.close(); window.__storageResult='saved'; };t.onabort=()=>window.__storageResult='failed';}; })();");
        long deadline = System.currentTimeMillis() + 10_000;
        while (!"\"saved\"".equals(evaluate(activity, "window.__storageResult")) && System.currentTimeMillis() < deadline) Thread.sleep(100);
        assertEquals("\"saved\"", evaluate(activity, "window.__storageResult"));
        evaluate(activity, "window.__oldPage=true");
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> activity.getBridge().getWebView().reload());
        deadline = System.currentTimeMillis() + 10_000;
        while (!"\"undefined\"".equals(evaluate(activity, "typeof window.__oldPage")) && System.currentTimeMillis() < deadline) Thread.sleep(100);
        assertEquals("Reload created a new JavaScript document", "\"undefined\"", evaluate(activity, "typeof window.__oldPage"));
        waitForEditor(activity);
        evaluate(activity, "window.__storageResult=null; (()=>{const r=indexedDB.open('lwrite-native-test',1);r.onsuccess=()=>{const db=r.result;const t=db.transaction('probe','readonly');const q=t.objectStore('probe').get('marker');q.onsuccess=()=>window.__storageResult=q.result;t.oncomplete=()=>db.close();};})();");
        deadline = System.currentTimeMillis() + 10_000;
        while (!evaluate(activity, "window.__storageResult").contains(marker) && System.currentTimeMillis() < deadline) Thread.sleep(100);
        assertTrue(evaluate(activity, "window.__storageResult").contains(marker));
        evaluate(activity, "indexedDB.deleteDatabase('lwrite-native-test')");
    }

    @Test public void nativeFileBridgeAcceptsJavascriptIntegerSizesAndOffsets() throws Exception {
        MainActivity activity = launch();
        waitForEditor(activity);
        evaluate(activity, "window.__fileResult=null; (async()=>{ const f=window.Capacitor.Plugins.LWriteFiles; let id; try { ({id}=await f.beginExport({name:'probe.txt',mimeType:'text/plain',size:5})); await f.writeChunk({id,offset:0,data:btoa('hello')}); const chunk=await f.readChunk({id,offset:0}); window.__fileResult=atob(chunk.data); } catch(e){window.__fileResult='error: '+e.message;} finally {if(id) await f.releaseFile({id});} })();");
        long deadline = System.currentTimeMillis() + 10_000;
        while ("null".equals(evaluate(activity, "window.__fileResult")) && System.currentTimeMillis() < deadline) Thread.sleep(100);
        assertEquals("\"hello\"", evaluate(activity, "window.__fileResult"));
    }

    @Test public void openWithImportsAGrantedContentUriFromALegalScreen() throws Exception {
        MainActivity activity = launch();
        waitForEditor(activity);
        // Use a fresh emulator; never replace a developer's existing draft.
        assertEquals("true", evaluate(activity, "document.querySelector('.ProseMirror').textContent.trim()===''"));
        String marker = "Android content URI import " + System.currentTimeMillis();
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File dir = new File(context.getCacheDir(), "lwrite-files/native-test");
        assertTrue(dir.exists() || dir.mkdirs());
        File document = new File(dir, "incoming.txt");
        try (FileOutputStream output = new FileOutputStream(document)) { output.write(marker.getBytes(StandardCharsets.UTF_8)); }
        try {
            evaluate(activity, "document.querySelector('a[href=\"/privacy\"],a[href=\"/datenschutz\"]').click()");
            long deadline = System.currentTimeMillis() + 10_000;
            while ("\"/\"".equals(evaluate(activity, "location.pathname")) && System.currentTimeMillis() < deadline) Thread.sleep(100);
            assertNotEquals("\"/\"", evaluate(activity, "location.pathname"));
            Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", document);
            Intent intent = new Intent(Intent.ACTION_VIEW).setClass(context, MainActivity.class).setDataAndType(uri, "text/plain")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> context.startActivity(intent));
            deadline = System.currentTimeMillis() + 20_000;
            while (!evaluate(activity, "document.querySelector('.ProseMirror')?.textContent || ''").contains(marker) && System.currentTimeMillis() < deadline) Thread.sleep(100);
            assertEquals("\"/\"", evaluate(activity, "location.pathname"));
            assertTrue(evaluate(activity, "document.querySelector('.ProseMirror').textContent").contains(marker));
            evaluate(activity, "window.__savedImport=null; (()=>{const r=indexedDB.open('lwrite',1);r.onsuccess=()=>{const db=r.result;const t=db.transaction('documents','readonly');const q=t.objectStore('documents').get('lwrite-current-doc');q.onsuccess=()=>window.__savedImport=q.result || '';t.oncomplete=()=>db.close();};})();");
            deadline = System.currentTimeMillis() + 20_000;
            while (!evaluate(activity, "window.__savedImport || ''").contains(marker) && System.currentTimeMillis() < deadline) {
                Thread.sleep(100);
                evaluate(activity, "(()=>{const r=indexedDB.open('lwrite',1);r.onsuccess=()=>{const db=r.result;const t=db.transaction('documents','readonly');const q=t.objectStore('documents').get('lwrite-current-doc');q.onsuccess=()=>window.__savedImport=q.result || '';t.oncomplete=()=>db.close();};})()");
            }
            assertTrue("Imported draft committed before APK replacement", evaluate(activity, "window.__savedImport || ''").contains(marker));
        } finally { document.delete(); dir.delete(); }
    }
}
