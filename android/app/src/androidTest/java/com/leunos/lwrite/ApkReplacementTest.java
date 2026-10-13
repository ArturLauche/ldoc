package com.leunos.lwrite;

import static org.junit.Assert.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Second CI phase: the already-populated app is upgraded from code 1 to 2. */
@RunWith(AndroidJUnit4.class)
public class ApkReplacementTest {
    @Test public void draftAndLibrarySurviveAColdLaunchAfterAHigherVersionApk() throws Exception {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals(2, ApkTrust.version(context.getPackageManager().getPackageInfo(context.getPackageName(), 0)));
        MainActivity activity = OfflineEditorTest.launch();
        OfflineEditorTest.waitForEditor(activity);
        String marker = "Android content URI import ";
        assertTrue(OfflineEditorTest.evaluate(activity, "document.querySelector('.ProseMirror').textContent").contains(marker));
        OfflineEditorTest.evaluate(activity, "window.__replacementRecords=null; (()=>{const r=indexedDB.open('lwrite',1);r.onsuccess=()=>{const db=r.result;const t=db.transaction('documents','readonly');const store=t.objectStore('documents');const values={};for(const k of ['lwrite-current-doc','lwrite-doc-library']){const q=store.get(k);q.onsuccess=()=>values[k]=q.result;}t.oncomplete=()=>{db.close();window.__replacementRecords=JSON.stringify(values);};};})()");
        long deadline = System.currentTimeMillis() + 10_000;
        while ("null".equals(OfflineEditorTest.evaluate(activity, "window.__replacementRecords")) && System.currentTimeMillis() < deadline) Thread.sleep(100);
        String records = OfflineEditorTest.evaluate(activity, "window.__replacementRecords");
        assertTrue(records.contains("lwrite-current-doc"));
        assertTrue(records.contains("lwrite-doc-library"));
        assertEquals("Draft and library both retain the imported document", 2, records.split(marker, -1).length - 1);
    }
}
