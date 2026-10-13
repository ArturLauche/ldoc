import { test } from 'node:test';
import assert from 'node:assert/strict';
import { androidVersion } from './version.mjs';
import { releaseMetadata } from './release-metadata.mjs';

test('stable tags map to monotonic version codes without using CI run numbers', () => {
  assert.equal(androidVersion('v1.0.0').versionCode, 1_000_000);
  assert.ok(androidVersion('v1.1.0').versionCode > androidVersion('v1.0.999').versionCode);
  assert.ok(androidVersion('v2.0.0').versionCode > androidVersion('v1.999.999').versionCode);
  assert.equal(androidVersion('v2000.999.999').versionCode, 2_000_999_999);
  for (const tag of ['v0.0.0', 'v01.0.0', 'v1.0.0-beta', 'v1.0.0+2', '1.0.0', 'v2001.0.0', 'v1.1000.0']) assert.throws(() => androidVersion(tag));
});
test('release metadata matches the native updater protocol', () => {
  const args = { tag: 'v1.0.0', apkName: 'LWrite-Android-v1.0.0.apk', size: 1000, sha256: 'a'.repeat(64), certificate: 'b'.repeat(64) };
  const manifest = releaseMetadata(args);
  assert.equal(manifest.channel, 'stable');
  assert.equal(manifest.applicationId, 'com.leunos.lwrite');
  assert.equal(manifest.repository, 'ArturLauche/ldoc');
  assert.equal(manifest.versionCode, 1_000_000);
  for (const changed of [{ apkName: 'arbitrary.apk' }, { size: 0 }, { size: 128 * 1024 * 1024 + 1 }, { sha256: 'bad' }, { certificate: 'bad' }]) assert.throws(() => releaseMetadata({ ...args, ...changed }));
});
