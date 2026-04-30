import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

// ── Release signing via environment variables ─────────────────────────────────
// Set all four vars before running a release build. Debug builds work without them.
//
//   export DZERKOUT_ANDROID_KEYSTORE_PATH=/path/to/dzerkout-release-key.jks
//   export DZERKOUT_ANDROID_KEYSTORE_PASSWORD=<store-password>
//   export DZERKOUT_ANDROID_KEY_ALIAS=<key-alias>
//   export DZERKOUT_ANDROID_KEY_PASSWORD=<key-password>

val envKeystorePath     = System.getenv("DZERKOUT_ANDROID_KEYSTORE_PATH")
val envKeystorePassword = System.getenv("DZERKOUT_ANDROID_KEYSTORE_PASSWORD")
val envKeyAlias         = System.getenv("DZERKOUT_ANDROID_KEY_ALIAS")
val envKeyPassword      = System.getenv("DZERKOUT_ANDROID_KEY_PASSWORD")

val releaseSigningReady = listOf(envKeystorePath, envKeystorePassword, envKeyAlias, envKeyPassword)
    .all { !it.isNullOrBlank() }

android {
    compileSdk = 36
    namespace = "com.dzerkout.app"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.dzerkout.app"
        minSdk = 24
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
        ndk {
            // arm64-v8a covers all modern Android phones.
            // The "universal" APK variant produced by Tauri's build system also
            // respects this filter, keeping release APKs small (~20 MB).
            // Note: x86_64 emulators run ARM code via translation — dev workflow unaffected.
            abiFilters += listOf("arm64-v8a")
        }
    }
    signingConfigs {
        if (releaseSigningReady) {
            create("release") {
                storeFile     = file(envKeystorePath!!)
                storePassword = envKeystorePassword
                keyAlias      = envKeyAlias
                keyPassword   = envKeyPassword
            }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
            // Apply signing config when env vars are present; otherwise leave unsigned.
            // The requireReleaseSigning task (wired in below) will abort the build
            // with a clear error message before any release assembly task runs.
            signingConfig = signingConfigs.findByName("release")
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

// ── Guard: fail release builds clearly when signing env vars are absent ───────
tasks.register("requireReleaseSigning") {
    group = "verification"
    description = "Fails with an actionable message when release signing env vars are not set."
    doFirst {
        if (!releaseSigningReady) {
            val missing = mapOf(
                "DZERKOUT_ANDROID_KEYSTORE_PATH"     to envKeystorePath,
                "DZERKOUT_ANDROID_KEYSTORE_PASSWORD" to envKeystorePassword,
                "DZERKOUT_ANDROID_KEY_ALIAS"         to envKeyAlias,
                "DZERKOUT_ANDROID_KEY_PASSWORD"      to envKeyPassword,
            ).filterValues { it.isNullOrBlank() }.keys
            error("""

Release signing is not configured. Export these env vars before running a release build:

${missing.joinToString("\n") { "  export $it=..." }}

See ANDROID.md in the project root for full setup instructions.
""")
        }
    }
}

// Wire the guard into every release assembly / bundle task automatically.
afterEvaluate {
    tasks.matching { task ->
        val n = task.name
        (n.startsWith("assemble") || n.startsWith("bundle")) && n.endsWith("Release")
    }.configureEach {
        dependsOn("requireReleaseSigning")
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")
