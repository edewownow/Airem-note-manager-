/**
 * Config plugin (feat/built-in-voice): keep ONE MMKV in the app.
 *
 * react-native-sherpa-onnx adds `com.tencent:mmkv-shared:1.3.16` for its download helper
 * (@kesha-antonov/react-native-background-downloader), which MemoAirem doesn't use and excludes
 * from autolinking (package.json expo.autolinking.exclude). react-native-mmkv v4 — where ALL of
 * MemoAirem's data lives — already ships MMKV (Margelo fork, io.github.zhongwuzw:mmkv 2.4.x).
 * Two MMKVs means duplicate classes / two libmmkv.so in one APK, so the extra one is excluded
 * from the app. sherpa-onnx's own Android code never uses MMKV.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// MemoAirem: exclude duplicate MMKV (withNoDuplicateMmkv)';

module.exports = function withNoDuplicateMmkv(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARK)) {
      cfg.modResults.contents += `
${MARK}
configurations.all {
    exclude group: 'com.tencent', module: 'mmkv-shared'
}
`;
    }
    return cfg;
  });
};
