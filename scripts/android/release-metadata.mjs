import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { androidVersion } from './version.mjs';

export function releaseMetadata({ tag, apkName, size, sha256, certificate }) {
  const version = androidVersion(tag);
  if (apkName !== version.apkName || !Number.isSafeInteger(size) || size <= 0 || size > 128 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(sha256) || !/^[a-f0-9]{64}$/.test(certificate)) throw new Error('Invalid APK release metadata.');
  return {
    schemaVersion: 1, repository: 'ArturLauche/ldoc', channel: 'stable', applicationId: 'com.leunos.lwrite',
    ...version, minSdkVersion: 24, targetSdkVersion: 36, size, sha256, signingCertificateSha256: certificate,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [tag, apk, verification] = process.argv.slice(2);
  const verified = JSON.parse(readFileSync(verification, 'utf8'));
  const version = androidVersion(tag);
  if (verified.applicationId !== 'com.leunos.lwrite' || verified.versionCode !== version.versionCode ||
      verified.versionName !== version.versionName || verified.debuggable || verified.minSdkVersion !== 24 || verified.targetSdkVersion !== 36) throw new Error('Release APK has incorrect verified package metadata.');
  const sha256 = createHash('sha256').update(readFileSync(apk)).digest('hex');
  const manifest = releaseMetadata({ tag, apkName: basename(apk), size: statSync(apk).size, sha256, certificate: verified.certificate });
  writeFileSync(`${apk}.sha256`, `${sha256}  ${basename(apk)}\n`);
  writeFileSync(join(dirname(apk), 'LWrite-Android-update.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}
