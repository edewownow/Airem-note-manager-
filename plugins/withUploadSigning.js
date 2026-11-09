/**
 * Config plugin (2.0.0 / build 95): release signing for the Play upload, kept through `expo prebuild`
 * (android/ is generated and gitignored). Same result as scripts/android/app-build.gradle:
 *   - phone test builds (assembleRelease) keep the DEBUG key — they install over the app on the phone
 *     without an uninstall, so the private folder is never lost;
 *   - `bundleRelease -Pupload` signs the Play AAB with the upload key, read from
 *     %USERPROFILE%\.gradle\gradle.properties (MEMOAIREM_UPLOAD_*) — never from the project or git;
 *   - release is never debuggable.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// MemoAirem upload key (withUploadSigning)';

const UPLOAD = `
        ${MARK}: ONLY with -Pupload (the Play AAB). The key file and
        // passwords live in %USERPROFILE%\\\\.gradle\\\\gradle.properties — never in this project or git.
        if (project.hasProperty('upload')) {
            def need = ['MEMOAIREM_UPLOAD_STORE_FILE', 'MEMOAIREM_UPLOAD_STORE_PASSWORD', 'MEMOAIREM_UPLOAD_KEY_ALIAS', 'MEMOAIREM_UPLOAD_KEY_PASSWORD']
            def missing = need.findAll { !project.hasProperty(it) }
            if (!missing.isEmpty()) throw new GradleException("Upload key not set up — missing in ~/.gradle/gradle.properties: " + missing.join(', '))
            upload {
                storeFile file(project.property('MEMOAIREM_UPLOAD_STORE_FILE'))
                storePassword project.property('MEMOAIREM_UPLOAD_STORE_PASSWORD')
                keyAlias project.property('MEMOAIREM_UPLOAD_KEY_ALIAS')
                keyPassword project.property('MEMOAIREM_UPLOAD_KEY_PASSWORD')
            }
        }`;

module.exports = function withUploadSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let s = cfg.modResults.contents;
    if (s.includes(MARK)) return cfg;
    // after the debug signing config
    s = s.replace(/(signingConfigs\s*\{\s*debug\s*\{[^}]*\})/, `$1${UPLOAD}`);
    // the release build type: upload key only with -Pupload; never debuggable
    s = s.replace(
      /(release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      `$1signingConfig project.hasProperty('upload') ? signingConfigs.upload : signingConfigs.debug\n            debuggable false`,
    );
    if (!s.includes(MARK) || !s.includes("signingConfigs.upload : signingConfigs.debug")) {
      throw new Error('withUploadSigning: app/build.gradle did not look as expected — check it by hand');
    }
    cfg.modResults.contents = s;
    return cfg;
  });
};
