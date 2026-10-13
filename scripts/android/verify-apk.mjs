import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [apk, variant, output] = process.argv.slice(2);
if (!apk || !['debug', 'release'].includes(variant) || !existsSync(apk) || statSync(apk).size === 0) throw new Error('Provide a real APK path and debug/release variant.');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk) throw new Error('ANDROID_HOME must point to the Android SDK.');
const versions = readdirSync(join(sdk, 'build-tools')).filter((entry) => /^\d+\.\d+\.\d+$/.test(entry)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
const tools = join(sdk, 'build-tools', versions.at(-1) ?? '');
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C' } });
const signature = run(join(tools, 'apksigner'), ['verify', '--verbose', '--print-certs', apk]);
const certificate = /Signer #1 certificate SHA-256 digest: ([a-f0-9]{64})/i.exec(signature)?.[1].toLowerCase();
if (!certificate || signature.includes('Signer #2 certificate')) throw new Error('APK must have exactly one valid signer.');
const badging = run(join(tools, 'aapt'), ['dump', 'badging', apk]);
const match = /package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/.exec(badging);
if (!match) throw new Error('APK package metadata is unreadable.');
const metadata = {
  applicationId: match[1], versionCode: Number(match[2]), versionName: match[3],
  minSdkVersion: Number(/sdkVersion:'(\d+)'/.exec(badging)?.[1]),
  targetSdkVersion: Number(/targetSdkVersion:'(\d+)'/.exec(badging)?.[1]),
  debuggable: /^application-debuggable$/m.test(badging), certificate,
};
const expectedId = variant === 'debug' ? 'com.leunos.lwrite.debug' : 'com.leunos.lwrite';
if (metadata.applicationId !== expectedId || metadata.debuggable !== (variant === 'debug') || metadata.minSdkVersion !== 24 || metadata.targetSdkVersion !== 36 || metadata.versionCode < 1) throw new Error(`Incorrect ${variant} APK metadata: ${JSON.stringify(metadata)}`);
if (variant === 'release') {
  const expected = process.env.LWRITE_SIGNING_CERT_SHA256?.replaceAll(':', '').toLowerCase();
  if (!expected || !/^[a-f0-9]{64}$/.test(expected) || expected !== certificate) throw new Error('Release signer differs from LWRITE_SIGNING_CERT_SHA256.');
}
const entries = run('unzip', ['-Z1', apk]).split('\n');
for (const required of ['AndroidManifest.xml', 'classes.dex', 'assets/public/index.html', 'assets/capacitor.config.json']) {
  if (!entries.includes(required)) throw new Error(`APK is missing ${required}`);
}
if (!entries.some((entry) => /^assets\/public\/assets\/.+\.js$/.test(entry)) || !entries.some((entry) => entry.startsWith('assets/public/fonts/'))) throw new Error('Editor scripts and offline fonts must be bundled.');
const config = JSON.parse(run('unzip', ['-p', apk, 'assets/capacitor.config.json']));
if (config.server?.url || config.server?.hostname !== 'localhost' || config.server?.androidScheme !== 'https' || config.android?.allowMixedContent !== false) throw new Error('APK must load bundled assets at the permanent secure local origin.');
if (entries.some((entry) => /\.(jks|keystore|p12)$/.test(entry))) throw new Error('APK contains signing material.');
if (output) writeFileSync(output, `${JSON.stringify(metadata, null, 2)}\n`);
process.stdout.write(`Verified ${variant} APK: ${JSON.stringify(metadata)}\n`);
