package com.leunos.lwrite;

import static org.junit.Assert.*;
import java.io.IOException;
import org.junit.Test;

public class UpdatePolicyTest {
    @Test public void versionCodesAreOrderedAcrossMajorAndMinorBoundaries() throws Exception {
        assertEquals(1_000_000, UpdatePolicy.versionCode("v1.0.0"));
        assertTrue(UpdatePolicy.versionCode("v1.1.0") > UpdatePolicy.versionCode("v1.0.999"));
        assertTrue(UpdatePolicy.versionCode("v2.0.0") > UpdatePolicy.versionCode("v1.999.999"));
        assertEquals(2_000_999_999, UpdatePolicy.versionCode("v2000.999.999"));
    }
    @Test public void malformedPrereleaseAndOverflowVersionsAreRejected() {
        for (String tag : new String[]{"v0.0.0", "v01.0.0", "v1.0.0-beta", "v1.0.0+2", "1.0.0", "v2001.0.0", "v1.1000.0", "v1.0.-1", "v1.0.0/evil"}) {
            assertThrows(tag, IOException.class, () -> UpdatePolicy.versionCode(tag));
        }
    }
    @Test public void onlyExpectedRepositoryAssetsAndHttpsRedirectsPass() throws Exception {
        assertEquals("https://github.com/ArturLauche/ldoc/releases/download/v1.0.0/LWrite-Android-v1.0.0.apk", UpdatePolicy.assetUrl("v1.0.0", UpdatePolicy.apkName("v1.0.0")));
        assertThrows(IOException.class, () -> UpdatePolicy.assetUrl("v1.0.0", "other.apk"));
        assertTrue(UpdatePolicy.trustedRedirect("https://release-assets.githubusercontent.com/github-production-release-asset/a?sig=x"));
        for (String url : new String[]{"http://github.com/a", "https://github.com.evil.test/a", "https://evil.test/a", "https://user@github.com/a", "https://github.com:8443/a", "https://github.com/a#x", "file:///a.apk"}) assertFalse(url, UpdatePolicy.trustedRedirect(url));
        assertFalse(UpdatePolicy.releaseUrl("v1.0.0", "https://github.com/other/ldoc/releases/tag/v1.0.0"));
    }
    @Test public void checksumMustNameExactlyOneExpectedAsset() throws Exception {
        String hash = "a".repeat(64), name = "LWrite-Android-v1.0.0.apk";
        assertEquals(hash, UpdatePolicy.checksum(hash + "  " + name + "\n", name));
        assertThrows(IOException.class, () -> UpdatePolicy.checksum(hash + "  other.apk\n", name));
        assertThrows(IOException.class, () -> UpdatePolicy.checksum(hash + "  " + name + "\nextra", name));
        assertThrows(IOException.class, () -> UpdatePolicy.checksum("invalid  " + name, name));
    }
    @Test public void resumingRequiresTheExactRemainingByteRange() {
        assertTrue(UpdatePolicy.validRange("bytes 20-99/100", 20, 100));
        assertFalse(UpdatePolicy.validRange("bytes 0-99/100", 20, 100));
        assertFalse(UpdatePolicy.validRange("bytes 20-98/100", 20, 100));
        assertFalse(UpdatePolicy.validRange("bytes 20-99/101", 20, 100));
        assertFalse(UpdatePolicy.validRange(null, 20, 100));
    }
    @Test public void backoffIsBoundedAndIncreases() {
        assertEquals(15 * 60 * 1000L, UpdatePolicy.retryDelay(1));
        assertEquals(30 * 60 * 1000L, UpdatePolicy.retryDelay(2));
        assertEquals(UpdatePolicy.CHECK_INTERVAL_MS, UpdatePolicy.retryDelay(8));
    }
    private ReleaseDescriptor release(String repository, String channel, String id, int code, String apk, long size, String hash) throws Exception {
        return new ReleaseDescriptor(repository, channel, id, "v1.0.0", "1.0.0", code, 24, 36, apk, size, hash, "b".repeat(64));
    }
    @Test public void metadataRejectsOtherPackagesChannelsVersionsAndOversizeArtifacts() throws Exception {
        ReleaseDescriptor valid = release(UpdatePolicy.REPOSITORY, "stable", UpdatePolicy.APPLICATION_ID, 1_000_000, "LWrite-Android-v1.0.0.apk", 100, "a".repeat(64));
        assertTrue(valid.sameArtifact(valid));
        assertFalse(valid.sameArtifact(null));
        assertThrows(IOException.class, () -> release("other/repo", "stable", UpdatePolicy.APPLICATION_ID, 1_000_000, valid.apk, 100, valid.sha256));
        assertThrows(IOException.class, () -> release(UpdatePolicy.REPOSITORY, "beta", UpdatePolicy.APPLICATION_ID, 1_000_000, valid.apk, 100, valid.sha256));
        assertThrows(IOException.class, () -> release(UpdatePolicy.REPOSITORY, "stable", "com.other.app", 1_000_000, valid.apk, 100, valid.sha256));
        assertThrows(IOException.class, () -> release(UpdatePolicy.REPOSITORY, "stable", UpdatePolicy.APPLICATION_ID, 1_000_001, valid.apk, 100, valid.sha256));
        assertThrows(IOException.class, () -> release(UpdatePolicy.REPOSITORY, "stable", UpdatePolicy.APPLICATION_ID, 1_000_000, "evil.apk", 100, valid.sha256));
        assertThrows(IOException.class, () -> release(UpdatePolicy.REPOSITORY, "stable", UpdatePolicy.APPLICATION_ID, 1_000_000, valid.apk, UpdatePolicy.APK_LIMIT + 1, valid.sha256));
        assertThrows(IOException.class, () -> release(UpdatePolicy.REPOSITORY, "stable", UpdatePolicy.APPLICATION_ID, 1_000_000, valid.apk, 100, "bad"));
    }
}
