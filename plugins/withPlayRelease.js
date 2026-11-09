/**
 * Play Console release fixes, kept through `expo prebuild` (android/ is generated).
 *
 * - R8 minify + resource shrink. Play's 25% bar (February 2027, only if DEX is over 10 MB)
 *   is already met inside r8.json (~78%). Play shows ~2% until the shrinker is R8 9+,
 *   because older R8 metadata is ignored. settings.gradle loads R8 9.4 ahead of AGP 8.12.
 * - No portrait lock. Android 16 ignores one on large screens and Play warns while it is set.
 *   The ML Kit barcode delegate activity ships its own portrait lock; tools:remove drops it.
 * - No android:statusBarColor / navigationBarColor. Those theme parameters are deprecated
 *   in Android 15. The React Native call sites are rewritten by
 *   scripts/android/strip-play-edge-apis.js, which app/build.gradle runs on every preBuild.
 */
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withAndroidStyles, withAppBuildGradle, withDangerousMod, withGradleProperties, withSettingsGradle } = require('expo/config-plugins');

// Play reads obfuscation / optimization / shrinking from r8.json only when version is 9+.
// AGP 8.12 embeds 8.12.14, and Play then guesses from class names (~2%). 9.4.x is the
// line verified with AGP 8. Must be on the pluginManagement classpath, ahead of AGP.
const R8 = 'com.android.tools:r8:9.4.34';
const R8_BLOCK = `
    // MemoAirem (withPlayRelease): R8 9 so Play reads the real DEX scores.
    buildscript {
        repositories {
            google()
            mavenCentral()
        }
        dependencies {
            classpath('${R8}')
        }
    }
`;

const KEEP = `
# MemoAirem: JNI libraries R8 must not rename. Sherpa looks classes up by their real names.
-keep class com.k2fsa.sherpa.onnx.** { *; }
-keep class com.sherpaonnx.** { *; }
-keep class expo.modules.memoairemvault.** { *; }
`;

const MARK = '// MemoAirem Play release (withPlayRelease)';

const HOOK = `
${MARK}
tasks.configureEach { task ->
    if (task.name == "preBuild") {
        task.doFirst {
            def script = new File(projectRoot, "scripts/android/strip-play-edge-apis.js")
            if (!script.exists()) throw new GradleException("Missing " + script)
            def proc = new ProcessBuilder("node", script.absolutePath).redirectErrorStream(true).start()
            def output = proc.inputStream.getText("UTF-8")
            if (proc.waitFor() != 0) throw new GradleException("strip-play-edge-apis failed:\\n" + output)
        }
    }
}
`;

function upsertProp(props, key, value) {
  const existing = props.find((p) => p.type === 'property' && p.key === key);
  if (existing) existing.value = value;
  else props.push({ type: 'property', key, value });
}

function withPlayProperties(config) {
  return withGradleProperties(config, (cfg) => {
    upsertProp(cfg.modResults, 'android.enableMinifyInReleaseBuilds', 'true');
    upsertProp(cfg.modResults, 'android.enableShrinkResourcesInReleaseBuilds', 'true');
    return cfg;
  });
}

function withPlayGradle(config) {
  return withAppBuildGradle(config, (cfg) => {
    let s = cfg.modResults.contents;
    s = s.replace(
      'getDefaultProguardFile("proguard-android.txt")',
      'getDefaultProguardFile("proguard-android-optimize.txt")',
    );
    if (!s.includes(MARK)) {
      if (!s.includes('configurations.all {')) {
        throw new Error('withPlayRelease: app/build.gradle had no configurations.all block');
      }
      s = s.replace('configurations.all {', `${HOOK}\nconfigurations.all {`);
    }
    cfg.modResults.contents = s;
    return cfg;
  });
}

function withPlayManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$ = manifest.$ || {};
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }
    const app = manifest.application && manifest.application[0];
    if (!app) return cfg;
    const activities = app.activity || [];
    for (const activity of activities) {
      if (activity.$ && activity.$['android:screenOrientation']) {
        delete activity.$['android:screenOrientation'];
      }
    }
    const mlkit = 'com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity';
    if (!activities.some((a) => a.$ && a.$['android:name'] === mlkit)) {
      activities.push({
        $: {
          'android:name': mlkit,
          'tools:remove': 'android:screenOrientation',
        },
      });
      app.activity = activities;
    }
    return cfg;
  });
}

function withPlayStyles(config) {
  return withAndroidStyles(config, (cfg) => {
    const styles = cfg.modResults.resources.style || [];
    const list = Array.isArray(styles) ? styles : [styles];
    for (const style of list) {
      if (!style.item) continue;
      const items = Array.isArray(style.item) ? style.item : [style.item];
      style.item = items.filter((item) => {
        const name = item.$ && item.$.name;
        return name !== 'android:statusBarColor' && name !== 'android:navigationBarColor';
      });
    }
    return cfg;
  });
}

function withPlayKeeps(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (!current.includes('com.k2fsa.sherpa.onnx.**')) {
        fs.writeFileSync(file, current.replace(/\s*$/, '\n') + KEEP);
      }
      return cfg;
    },
  ]);
}

function withPlayR8(config) {
  return withSettingsGradle(config, (cfg) => {
    let s = cfg.modResults.contents;
    if (s.includes('com.android.tools:r8:')) return cfg;
    const needle = 'pluginManagement {';
    const at = s.indexOf(needle);
    if (at < 0) throw new Error('withPlayRelease: settings.gradle had no pluginManagement');
    const insertAt = at + needle.length;
    cfg.modResults.contents = s.slice(0, insertAt) + '\n' + R8_BLOCK + s.slice(insertAt);
    return cfg;
  });
}

module.exports = function withPlayRelease(config) {
  config = withPlayR8(config);
  config = withPlayProperties(config);
  config = withPlayGradle(config);
  config = withPlayManifest(config);
  config = withPlayStyles(config);
  config = withPlayKeeps(config);
  return config;
};
