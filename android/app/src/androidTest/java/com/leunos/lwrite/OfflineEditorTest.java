package com.leunos.lwrite;

import static org.junit.Assert.*;
import android.content.Intent;
import android.webkit.WebView;
import android.content.Context;
import android.os.Build;
import android.os.SystemClock;
import android.net.Uri;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import androidx.core.content.FileProvider;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
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

    private static void waitForSystemBarStyle(MainActivity activity, boolean light) throws Exception {
        long deadline = System.currentTimeMillis() + 10_000;
        AtomicReference<Boolean> matched = new AtomicReference<>(false);
        do {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(activity.getWindow(), activity.getWindow().getDecorView());
                matched.set(controller.isAppearanceLightStatusBars() == light
                    && (Build.VERSION.SDK_INT < 26 || controller.isAppearanceLightNavigationBars() == light));
            });
            if (matched.get()) return;
            Thread.sleep(100);
        } while (System.currentTimeMillis() < deadline);
        fail("Status and navigation bars did not follow the editor theme: light=" + light);
    }

    @Test public void systemBarsFollowBothEditorThemes() throws Exception {
        MainActivity activity = launch();
        waitForEditor(activity);
        evaluate(activity, "document.documentElement.classList.remove('dark')");
        waitForSystemBarStyle(activity, true);
        evaluate(activity, "document.documentElement.classList.add('dark')");
        waitForSystemBarStyle(activity, false);
        evaluate(activity, "document.documentElement.classList.remove('dark')");
        waitForSystemBarStyle(activity, true);
    }

    private static void waitForKeyboard(MainActivity activity, boolean visible) throws Exception {
        long deadline = System.currentTimeMillis() + 20_000;
        AtomicReference<Boolean> matched = new AtomicReference<>(false);
        do {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(activity.getWindow().getDecorView());
                matched.set(insets != null && insets.isVisible(WindowInsetsCompat.Type.ime()) == visible);
            });
            if (matched.get()) return;
            Thread.sleep(100);
        } while (System.currentTimeMillis() < deadline);
        fail("Android keyboard visibility did not become " + visible);
    }

    @Test public void nativeTypingKeepsToolbarVisibleAndBackDismissesTheKeyboard() throws Exception {
        MainActivity activity = launch();
        waitForEditor(activity);
        String original = evaluate(activity, "document.querySelector('.ProseMirror').textContent");
        float density = Float.parseFloat(evaluate(activity, "window.devicePixelRatio"));
        float x = Float.parseFloat(evaluate(activity, "document.querySelector('.ProseMirror').getBoundingClientRect().left+16")) * density;
        float y = Float.parseFloat(evaluate(activity, "document.querySelector('.ProseMirror').getBoundingClientRect().top+16")) * density;
        int[] origin = new int[2];
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> activity.getBridge().getWebView().getLocationOnScreen(origin));
        long now = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, x + origin[0], y + origin[1], 0);
        MotionEvent up = MotionEvent.obtain(now, now + 10, MotionEvent.ACTION_UP, x + origin[0], y + origin[1], 0);
        down.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        InstrumentationRegistry.getInstrumentation().sendPointerSync(down);
        InstrumentationRegistry.getInstrumentation().sendPointerSync(up);
        down.recycle(); up.recycle();
        waitForKeyboard(activity, true);
        long deadline = System.currentTimeMillis() + 10_000;
        String toolbarVisible = "(()=>{const r=document.querySelector('.mobile-toolbar').getBoundingClientRect();const v=window.visualViewport;return r.top>=v.offsetTop && r.bottom<=v.offsetTop+v.height+1;})()";
        while (!"true".equals(evaluate(activity, toolbarVisible)) && System.currentTimeMillis() < deadline) Thread.sleep(100);
        assertEquals("Mobile controls stay inside the viewport above the native IME", "true", evaluate(activity, toolbarVisible));
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_A);
        deadline = System.currentTimeMillis() + 10_000;
        while (original.equals(evaluate(activity, "document.querySelector('.ProseMirror').textContent")) && System.currentTimeMillis() < deadline) Thread.sleep(100);
        assertNotEquals("Native input reaches TipTap", original, evaluate(activity, "document.querySelector('.ProseMirror').textContent"));
        evaluate(activity, "document.querySelector('.mobile-toolbar [aria-label=\"Undo\"]').click()");
        deadline = System.currentTimeMillis() + 10_000;
        while (!original.equals(evaluate(activity, "document.querySelector('.ProseMirror').textContent")) && System.currentTimeMillis() < deadline) Thread.sleep(100);
        assertEquals("Leave the persistence fixture unchanged", original, evaluate(activity, "document.querySelector('.ProseMirror').textContent"));
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
        waitForKeyboard(activity, false);
        AtomicReference<Boolean> foreground = new AtomicReference<>(false);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> foreground.set(activity.hasWindowFocus()));
        assertTrue("Back closes the IME before leaving the editor", foreground.get());
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
            waitForEditor(activity);
            evaluate(activity, "document.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true}))");
            evaluate(activity, "window.__savedImport=null; (()=>{const r=indexedDB.open('lwrite',1);r.onsuccess=()=>{const db=r.result;const t=db.transaction('documents','readonly');const q=t.objectStore('documents').get('lwrite-current-doc');q.onsuccess=()=>window.__savedImport=q.result || '';t.oncomplete=()=>db.close();};})();");
            deadline = System.currentTimeMillis() + 20_000;
            while (!evaluate(activity, "window.__savedImport || ''").contains(marker) && System.currentTimeMillis() < deadline) {
                Thread.sleep(100);
                evaluate(activity, "(()=>{const r=indexedDB.open('lwrite',1);r.onsuccess=()=>{const db=r.result;const t=db.transaction('documents','readonly');const q=t.objectStore('documents').get('lwrite-current-doc');q.onsuccess=()=>window.__savedImport=q.result || '';t.oncomplete=()=>db.close();};})()");
            }
            assertTrue("Imported draft committed before APK replacement", evaluate(activity, "window.__savedImport || ''").contains(marker));
            evaluate(activity, "window.__savedLibrary=null; (()=>{const r=indexedDB.open('lwrite',1);r.onsuccess=()=>{const db=r.result;const t=db.transaction('documents','readonly');const q=t.objectStore('documents').get('lwrite-doc-library');q.onsuccess=()=>window.__savedLibrary=q.result || '';t.oncomplete=()=>db.close();};})();");
            deadline = System.currentTimeMillis() + 20_000;
            while (!evaluate(activity, "window.__savedLibrary || ''").contains(marker) && System.currentTimeMillis() < deadline) {
                Thread.sleep(100);
                evaluate(activity, "(()=>{const r=indexedDB.open('lwrite',1);r.onsuccess=()=>{const db=r.result;const t=db.transaction('documents','readonly');const q=t.objectStore('documents').get('lwrite-doc-library');q.onsuccess=()=>window.__savedLibrary=q.result || '';t.oncomplete=()=>db.close();};})()");
            }
            assertTrue("Library committed before APK replacement", evaluate(activity, "window.__savedLibrary || ''").contains(marker));
        } finally { document.delete(); dir.delete(); }
    }
}
