package com.leunos.lwrite;

import static org.junit.Assert.*;
import android.content.Intent;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Runs against the real bundled WebView, not a mocked browser or hosted URL. */
@RunWith(AndroidJUnit4.class)
public class OfflineEditorTest {
    private MainActivity launch() {
        Intent intent = new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(), MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return (MainActivity) InstrumentationRegistry.getInstrumentation().startActivitySync(intent);
    }
    private String evaluate(MainActivity activity, String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> activity.getBridge().getWebView().evaluateJavascript(script, value -> { result.set(value); done.countDown(); }));
        assertTrue("WebView JavaScript callback", done.await(10, TimeUnit.SECONDS));
        return result.get();
    }
    private void waitForEditor(MainActivity activity) throws Exception {
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
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> activity.getBridge().getWebView().reload());
        waitForEditor(activity);
        evaluate(activity, "window.__storageResult=null; (()=>{const r=indexedDB.open('lwrite-native-test',1);r.onsuccess=()=>{const db=r.result;const t=db.transaction('probe','readonly');const q=t.objectStore('probe').get('marker');q.onsuccess=()=>window.__storageResult=q.result;t.oncomplete=()=>db.close();};})();");
        deadline = System.currentTimeMillis() + 10_000;
        while (!evaluate(activity, "window.__storageResult").contains(marker) && System.currentTimeMillis() < deadline) Thread.sleep(100);
        assertTrue(evaluate(activity, "window.__storageResult").contains(marker));
        evaluate(activity, "indexedDB.deleteDatabase('lwrite-native-test')");
    }
}
