/**
 * Config plugin: keep Kotlin 2.3.20 through `expo prebuild` (android/ is generated).
 *
 * LiteRT-LM 0.18 ships Kotlin metadata 2.4.0. The React Native default compiler (2.1.20)
 * can only read up to 2.2, so :memoairem-llm fails to compile. 2.3.20 can read 2.4 metadata,
 * and Expo's Pika compiler plugin publishes a matching build (pika-compiler:0.3.2-2.3.20).
 * There is no Pika build for Kotlin 2.4, so the app stays on 2.3.20.
 *
 * android.kotlinVersion alone does not change the compiler on SDK 56 — the root
 * buildscript classpath is unversioned and stays on React Native's 2.1.20 plugin.
 */
const { withGradleProperties, withProjectBuildGradle } = require('expo/config-plugins');

const KOTLIN = '2.3.20';
const MARK = '// MemoAirem Kotlin (withKotlinVersion)';

module.exports = function withKotlinVersion(config) {
  config = withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    const existing = props.find((p) => p.type === 'property' && p.key === 'android.kotlinVersion');
    if (existing) existing.value = KOTLIN;
    else props.push({ type: 'property', key: 'android.kotlinVersion', value: KOTLIN });
    return cfg;
  });

  config = withProjectBuildGradle(config, (cfg) => {
    let s = cfg.modResults.contents;
    if (!s.includes(MARK)) {
      const unversioned = "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')";
      if (!s.includes(unversioned)) {
        throw new Error('withKotlinVersion: android/build.gradle classpath line not found');
      }
      s = s.replace(
        unversioned,
        `${MARK}: LiteRT-LM 0.18 needs a compiler that can read Kotlin metadata 2.4.0.\n    classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:${KOTLIN}")`,
      );
    }
    if (!s.includes('ext.kotlinVersion')) {
      s = s.replace(
        'apply plugin: "expo-root-project"',
        `ext.kotlinVersion = findProperty('android.kotlinVersion') ?: '${KOTLIN}'\n\napply plugin: "expo-root-project"`,
      );
    }
    cfg.modResults.contents = s;
    return cfg;
  });

  return config;
};
