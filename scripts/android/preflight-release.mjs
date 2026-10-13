import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { androidVersion } from './version.mjs';

const version = androidVersion(process.env.GITHUB_REF_NAME ?? '');
const repository = 'ArturLauche/ldoc';
if (process.env.GITHUB_REPOSITORY !== repository) throw new Error('Official releases must originate from ArturLauche/ldoc.');
execFileSync('git', ['merge-base', '--is-ancestor', process.env.GITHUB_SHA, 'origin/main']);
const releases = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/releases?per_page=100`], { encoding: 'utf8' }));
for (const release of releases) {
  if (release.draft || release.prerelease) continue;
  let published;
  try { published = androidVersion(release.tag_name); } catch { continue; }
  if (release.assets.some((asset) => asset.name === published.apkName) && published.versionCode >= version.versionCode) {
    throw new Error('Published Android releases are immutable. Push a new, higher stable version tag.');
  }
}
for (const [key, value] of Object.entries(version)) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
writeFileSync('android-release-notes.md', `LWrite ${version.versionName} for Android\n\n- Full offline editor, document library, autosave, history, tables, images and Smart Graphics.\n- Open documents from Android Files; save all six export formats anywhere through Android’s save dialog; share or print natively.\n- Official APK updates download and verify automatically inside LWrite. Installation requires Android’s approval.\n- Documents and settings remain on your device when updating.\n\nInstall the APK asset below for the first installation. Later updates appear under App updates in LWrite. Enable “Allow from this source” for LWrite when Android asks. Android 7.0+ with Android System WebView 111+ is required.\n\nThe .sha256 file verifies the APK download; LWrite also verifies the installed signing certificate before offering an update.\n`);
process.stdout.write(`Validated ${version.tag}: versionCode ${version.versionCode}\n`);
