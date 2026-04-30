# Android Build Guide

## Quick reference

| Command | What it does |
|---|---|
| `npm run android:dev` | Hot-reload dev session on connected device/emulator |
| `npm run android:build:debug` | Debug APK (large, debuggable) |
| `npm run android:build:release` | Signed release APK (requires signing env vars) |

---

## Prerequisites

- Android SDK + NDK installed (via Android Studio or `sdkmanager`)
- `ANDROID_HOME` set
- NDK path configured (Tauri resolves this automatically if Android Studio is set up)
- Java 17+ on `PATH`
- For release builds: the signing keystore and four env vars (see below)

---

## Development / device testing

```zsh
npm run android:dev
```

Starts a Vite dev server and hot-reloads the webview on the connected device.
Requires `adb` to detect the device.

---

## Debug APK

```zsh
npm run android:build:debug
```

Output:
```
src-tauri/gen/android/app/build/outputs/apk/arm64/debug/app-arm64-debug.apk
src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

> **Size note:** Debug APKs are large (300–700 MB) because they keep full debug symbols
> for all ABI variants. This is normal. Release APKs are ~20 MB after minification.

---

## Release APK (signed)

### 1. Generate a keystore (one-time, skip if you already have one)

```zsh
keytool -genkeypair \
  -v \
  -storetype PKCS12 \
  -keystore /<key path>/dzerkout-release-key.jks \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000 \
  -alias dzerkout \
  -dname "CN=dzerkout, O=dzerkout, C=US"
```

> **Replace the path and alias with your own values.**
> The path above is a local example — adapt as needed.

> ⚠️ **Back up the keystore.** If you lose it you cannot publish updates to an app
> already installed under `com.dzerkout.app`. Android requires updates to be signed
> with the same key as the original install.

### 2. Export signing env vars

```zsh
export DZERKOUT_ANDROID_KEYSTORE_PATH=/<key path>/dzerkout-release-key.jks
export DZERKOUT_ANDROID_KEYSTORE_PASSWORD=<your-store-password>
export DZERKOUT_ANDROID_KEY_ALIAS=dzerkout
export DZERKOUT_ANDROID_KEY_PASSWORD=<your-key-password>
```

> These are **local shell exports only**. Never put passwords in committed files.
> Add them to your `~/.zshrc` (or a local `.env` file that is gitignored) if you
> build frequently.
>
> Alternatively, create a local helper script such as
> `scripts/android-release.local.sh`. That path is intentionally ignored by git
> so it can contain local signing env vars.

### 3. Build

```zsh
npm run android:build:release
```

Output:
```
src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk
src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
```

Use the **arm64** APK for sideloading on modern Android phones.
The **universal** APK is also arm64-only (ABI filter is set to `arm64-v8a`).

### What happens if env vars are missing?

The `requireReleaseSigning` Gradle task runs before any release assembly.
If any env var is absent the build aborts immediately with:

```
Release signing is not configured. Export these env vars before running a release build:
  export DZERKOUT_ANDROID_KEYSTORE_PATH=...
  ...
See ANDROID.md in the project root for full setup instructions.
```

No unsigned release APK is silently produced.

---

## App metadata

| Field | Value |
|---|---|
| Application ID | `com.dzerkout.app` |
| Display name | `dzerkout` |
| Version name | Sourced from `tauri.conf.json` → `version` (currently `0.0.1`) |
| Version code | Sourced from auto-generated `tauri.properties` → `tauri.android.versionCode` (currently `1`) |
| Min SDK | 24 (Android 7.0) |
| Target SDK | 36 |
| ABI filter | `arm64-v8a` only |

> **Version code** must increment for each release published to a store or sideloaded
> as an update. Update `version` in `src-tauri/tauri.conf.json`; Tauri regenerates
> `tauri.properties` on the next build.

---

## ABI notes

- Release builds target **arm64-v8a** only (all modern Android phones).
- Debug builds include debug symbols declared for multiple ABIs but only arm64 native
  code is compiled (matching the ABI filter).
- Android emulators using the x86_64 image can still run ARM64 apps via the built-in
  ARM translation layer, so the dev workflow (`android:dev`) works without an ARM64
  emulator. Native-speed emulation requires an ARM64 system image.

---

## Security reminders

- ⚠️ **Do not commit** `*.jks`, `*.keystore`, or `android-signing.properties` files.
  The root `.gitignore` already excludes these patterns.
- ⚠️ **Do not commit** signing passwords anywhere in source, scripts, or CI config
  without proper secret management (e.g., GitHub Encrypted Secrets).
- ⚠️ **Back up the keystore** to a secure location (password manager, encrypted storage).
  Losing it permanently prevents publishing updates under the same package ID.
