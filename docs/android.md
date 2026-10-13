# LWrite for Android

Android runs the same production React/TipTap editor in Capacitor **8.5.3**. Its HTML, JavaScript, fonts, graphics and export converters are bundled in the APK; it never loads the hosted editor. Android **7.0/API 24+** and Android System WebView **111+** are required. Keep WebView updated through the device's normal update mechanism.

## Develop and build

Install the repository's Node **24.21.0**, npm **10.9.2**, **JDK 21**, and Android Studio **Otter 2025.2.1+**. Install Android SDK Platform **36**, Build Tools **36.0.0**, and platform-tools. Set `JAVA_HOME` and `ANDROID_HOME` to those installations (or let Android Studio write the ignored `android/local.properties`). The committed Gradle **8.14.6** wrapper verifies its distribution checksum; Android Gradle Plugin is **8.13.0**.

```sh
npm ci --progress=false
npm run validate
npm run android:debug
# android/app/build/outputs/apk/debug/app-debug.apk

npm run android:open     # Android Studio: select a device and Run
npm run android:test     # Java unit tests and Android lint
node scripts/android/verify-apk.mjs android/app/build/outputs/apk/debug/app-debug.apk debug
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Run `npm run android:sync` after web changes before building in Android Studio. Windows users can run the corresponding `gradlew.bat` commands in `android/`. Do not configure `server.url`, change the local hostname/scheme, or replace the package ID between releases: the fixed **https://localhost** origin owns the IndexedDB library.

Development builds are visibly named **LWrite Dev**, use **com.leunos.lwrite.debug**, and disable official updates. They coexist with the production **LWrite/com.leunos.lwrite** application. Their document libraries are separate; move documents using the existing manual library export/import. A debug key cannot update a production installation.

Debug signing keys can differ between local machines and Actions runs. Export the development library before uninstalling a development build to switch keys; official releases always retain the permanent key.

## Download and install

Every PR and push to `main` runs the [Android workflow](../.github/workflows/android.yml). Open [Actions → Android](https://github.com/ArturLauche/ldoc/actions/workflows/android.yml), select a successful run, then download **LWrite-Android-Debug** under Artifacts. Unzip it and install `LWrite-Android-Debug.apk`. GitHub requires a signed-in account to download workflow artifacts; they expire after 30 days.

Official builds appear in [GitHub Releases](https://github.com/ArturLauche/ldoc/releases). Install the signed `LWrite-Android-vX.Y.Z.apk` once. Android may ask to allow installations from the browser/file manager used for that first installation. Subsequent updates download inside LWrite and ask for installation permission for **LWrite** itself. Allow “Install unknown apps / Allow from this source” only when you choose to install. Android's system installer always asks for approval.

## One-time permanent signing setup

The repository currently has no release signing secrets. The release job intentionally fails with a clear setup error until the following configuration exists; it never uses a debug key or publishes an unsigned APK.

Generate a permanent key **outside the checkout**, using interactive password prompts:

```sh
keytool -genkeypair -keystore /secure/location/lwrite-release.jks \
  -storetype JKS -alias lwrite -keyalg RSA -keysize 4096 -validity 36500
keytool -list -v -keystore /secure/location/lwrite-release.jks -alias lwrite
```

Use a real owner identity in the certificate. Keep at least two securely stored, encrypted copies of the keystore, alias and passwords, including an offline copy. **Losing this key prevents updates over existing installations.** Do not rotate it, delete it after CI setup, or commit it to Git. The SHA256 certificate fingerprint is public and is distinct from each APK's SHA256 file checksum.

In the repository's Settings → Secrets and variables → Actions, configure:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `ANDROID_KEYSTORE_BASE64` | Base64 encoding of the permanent JKS file |
| Secret | `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| Secret | `ANDROID_KEY_ALIAS` | `lwrite` (or your chosen alias) |
| Secret | `ANDROID_KEY_PASSWORD` | Key password |
| Variable | `ANDROID_SIGNING_CERT_SHA256` | Certificate SHA256 from `keytool -list -v`, without colons |

With `gh` authenticated as a repository administrator, the keystore can be uploaded without displaying it:

```sh
base64 < /secure/location/lwrite-release.jks | gh secret set ANDROID_KEYSTORE_BASE64 --repo ArturLauche/ldoc
gh secret set ANDROID_KEYSTORE_PASSWORD --repo ArturLauche/ldoc
gh secret set ANDROID_KEY_ALIAS --repo ArturLauche/ldoc
gh secret set ANDROID_KEY_PASSWORD --repo ArturLauche/ldoc
gh variable set ANDROID_SIGNING_CERT_SHA256 --repo ArturLauche/ldoc
```

The remaining commands prompt for their values. Set protected tag rules for `v*` so only release maintainers can publish official updates. Signing credentials are referenced only by the tag release job, after verifying the tagged commit is an ancestor of `main`; PR builds never receive them. CI removes its temporary keystore after the build, including failures.

## Publish an official release

Merge the implementation PR first; this task does not merge or publish a version. Tag a reviewed commit on `main`:

```sh
git switch main
git pull --ff-only origin main
git tag -a v1.0.0 -m 'LWrite 1.0.0 for Android'
git push origin v1.0.0
```

Stable tags must be `vMAJOR.MINOR.PATCH`; no prerelease suffix, leading zero or build suffix. Version codes are **major × 1,000,000 + minor × 1,000 + patch**. Major is at most 2000; minor and patch at most 999; `v0.0.0` is not a release. This ordering is independent of GitHub run numbers and survives workflow reruns. Published Android release assets are immutable: fixes require a strictly higher version tag.

The release workflow validates source/tag/version ordering, performs clean npm install, peer verification, full web validation, audit, native tests/lint, bundles the editor, signs the release APK and checks its package/version and permanent certificate fingerprint. Only after verification does it publish:

- `LWrite-Android-v1.0.0.apk`
- `LWrite-Android-v1.0.0.apk.sha256` (standard SHA256 filename record)
- `LWrite-Android-update.json` (schema 1, stable channel, package, tag, version code/name, SDKs, APK size/checksum and signing fingerprint)

The updater and workflow share this protocol. Existing draft releases can be completed; already published Android versions cannot be overwritten. The GitHub Actions debug artifact is never published as a stable release.

For a local signed build, set `LWRITE_VERSION_NAME`, `LWRITE_KEYSTORE_PATH`, `LWRITE_KEYSTORE_PASSWORD`, `LWRITE_KEY_ALIAS`, and `LWRITE_KEY_PASSWORD` in your shell without saving secrets in the repository. Run `npm run android:sync`, then `./gradlew assembleRelease` in `android/`. Set `LWRITE_SIGNING_CERT_SHA256` to the permanent public fingerprint and run `verify-apk.mjs` with `release` before distributing it. Gradle refuses release builds without complete signing configuration.

## Files, persistence and Android behavior

- Open uses Android's Storage Access Framework picker. Files/Downloads “Open with” and file sharing intents stage granted `content://` streams immediately, preserving their permission long enough to import. Known MIME types fill missing filename extensions; conflicting types, unknown oversized streams and unsupported formats are rejected. Imports run the existing parser, size checks, shared HTML sanitizer, replacement confirmation and safety snapshot logic.
- Save exports opens Android's destination picker for TXT, HTML, RTF, DOCX, ODT, PDF and existing library JSON exports. Share uses read-only FileProvider URIs and the system share sheet. Print passes the shared PDF exporter output to Android's print system. Canceling a save reports no success. Staging uses bounded bridge chunks; temporary shared files expire after seven days. No broad storage, contacts, media or notification permissions are requested.
- Documents, current draft and twenty-version history remain in the existing IndexedDB database; language/theme keep their existing preference storage. App ID, WebView origin and database schema stay fixed. Android updates replace the APK without clearing app data; failed downloads or canceled installations touch only the APK cache. Android automatic backup is disabled; existing manual library export/import remains the recovery mechanism.
- Back dismisses a dialog/menu/toolbar first; at the editor it waits for a successful save before moving the task to the background. Lifecycle events flush the draft. OS process kills and abrupt power loss still cannot guarantee saving the most recent keystrokes. Native system bars follow the editor theme; Capacitor safe-area insets protect edge controls; the keyboard resizes the WebView and keeps the mobile toolbar above it.
- Locally imported images and bundled fonts work offline. Remote image URLs still require their external server, as they do on the web. The browser version's downloads and existing routes remain available.

Uninstalling LWrite or clearing its Android app storage deletes the local library. Installing a new APK over the existing app does not. Export a manual library file before moving to another device or uninstalling.

## Automatic updates

Official builds check public releases at launch and while active, at most every six hours. The footer's **App updates** dialog shows installed/available versions, status/progress and **Check for updates**. It offers **Install update** only after download and verification; it never steals focus from editing. Downloads use the app's private APK cache, not Downloads. They can continue while the process is alive; after process termination LWrite resumes the partial transfer on a later check. This app does not schedule a background service or require notification permission.

Only stable `ArturLauche/ldoc` GitHub releases with all three expected assets qualify. The native updater constructs fixed HTTPS asset URLs, limits GitHub CDN redirects, validates tag/channel/package/version/SDK metadata and published size, compares the checksum file with the manifest, hashes the downloaded APK, then checks actual APK package, version, minimum SDK, non-debug status and the **installed signing certificate**. It rechecks before every installer handoff. A checksum alone is never treated as publisher authentication.

One transfer runs at a time. Verified APKs are reused rather than downloaded again; partial transfers use validated HTTP byte ranges, restarting if the server does not support them. Network failures retry with persisted backoff (15 minutes to six hours); GitHub rate limits defer checks. Missing releases, offline operation, dismissed dialogs and denied installer permission leave the editor and documents usable. Installation first waits for the document transaction to finish; if saving fails, it does not start.

## Verify changes

```sh
npm run validate
npm run audit
npm run test:browser -- --project=chromium # build first; install Chromium once
npm run android:debug
npm run android:test
# With a booted emulator/device:
cd android
./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.leunos.lwrite.OfflineEditorTest
```

Java tests cover version/channel/URL/checksum/range trust rules and bounded stream handling. TS tests cover native transfers, cancellation, corrupt replies, updater progress and save-before-departure behavior. Release-script tests verify version ordering and metadata generation. The APK verifier checks Android signatures, package metadata, offline assets and the fixed origin. Actions also runs Android 16 instrumentation with networking disabled: bundled editor launch, IndexedDB reload persistence, real bridge file chunks and content URI opening from a legal screen. It then builds a higher version code with the same development key, replaces the installed APK, cold-starts it and verifies the actual draft/library survived. A screenshot and test reports are uploaded as **LWrite-Android-Emulator**. Run the first phase on a fresh emulator; the opening test rejects an existing nonempty draft. Provider-specific picking/saving/sharing, IME selection and the official release downloader/system installer still need device validation; record those results honestly in the PR.

References: [Capacitor 8 Android toolchain](https://capacitorjs.com/docs/updating/8-0), [system bars and insets](https://capacitorjs.com/docs/apis/system-bars), [Android document access](https://developer.android.com/training/data-storage/shared/documents-files).
