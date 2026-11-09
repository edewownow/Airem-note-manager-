import { ExpoConfig } from 'expo/config';

/**
 * Snap → Schedule — Expo config (Android-first, Phase 1).
 * New Architecture is the SDK 56 default (required by react-native-mmkv v4) —
 * no explicit flag needed.
 * iOS keys are present for a later phase but iOS is NOT built now.
 */
const config: ExpoConfig = {
  name: 'MemoAirem Test',
  slug: 'memoairem-test',
  version: '2.0.1',
  // Unlocked so a tablet, foldable, or desktop window can rotate. Android 16 ignores a
  // portrait lock on large screens, and Play warns while the lock is still declared.
  orientation: 'default',
  icon: './assets/memoairem-app-icon.png',
  userInterfaceStyle: 'light',
  scheme: 'memoairem-test',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.valle.memoairem.test',
  },
  android: {
    package: 'com.valle.memoairem.test', // test variant: installs alongside the Play MemoAirem (com.valle.memoairem)
    versionCode: 149, // tracked source for the native build number (build.gradle is gitignored/generated)
    // The screenshot lock pulls in READ_MEDIA_IMAGES. Picking a photo uses the system picker.
    blockedPermissions: [
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
    ],
    // pan (not resize) so the bottom dock stays pinned to the screen bottom and is
    // covered by the keyboard rather than reflowing upward (MainScreen three-zone layout).
    softwareKeyboardLayoutMode: 'pan',
    adaptiveIcon: {
      backgroundColor: '#161E2A',
      foregroundImage: './assets/memoairem-adaptive-foreground.png',
    },
    predictiveBackGestureEnabled: false,
    // 1.10.0: no Android auto-backup of app data to Google — the Private folder must never leave
    // the phone, and Harbor already holds a copy of the normal records.
    allowBackup: false,
    permissions: ['CAMERA', 'RECORD_AUDIO', 'INTERNET'],
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    [
      'expo-camera',
      {
        cameraPermission: 'Allow MemoAirem Test to use the camera to capture schedules and flyers.',
        microphonePermission: 'Allow MemoAirem Test to use the microphone.',
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow MemoAirem Test to access your photos to import a schedule.',
        cameraPermission: 'Allow MemoAirem Test to use the camera to capture a schedule.',
      },
    ],
    [
      'expo-speech-recognition',
      {
        microphonePermission: 'Allow MemoAirem Test to use the microphone for voice input.',
        speechRecognitionPermission: 'Allow MemoAirem Test to recognize speech for voice input.',
      },
    ],
    'expo-sharing',
    // 1.10.0 Private folder: Keystore key (backup handled by allowBackup:false) + fingerprint/PIN
    ['expo-secure-store', { configureAndroidBackup: false, faceIDPermission: 'Allow MemoAirem Test to use Face ID to unlock your private folder.' }],
    // feat/built-in-voice: one MMKV only (react-native-mmkv's) — see plugins/withNoDuplicateMmkv.js
    './plugins/withNoDuplicateMmkv',
    // LiteRT-LM 0.18 needs Kotlin 2.3.20 (metadata 2.4). See plugins/withKotlinVersion.js
    './plugins/withKotlinVersion',
    // 2.0.0: Play upload key only with -Pupload; release never debuggable — see plugins/withUploadSigning.js
    './plugins/withUploadSigning',
    // Test variant: withPlayRelease is NOT applied here. It is Play-Store-only
    // treatment (R8 9, minify/shrink, portrait-lock + edge-color cleanup) and
    // it fails on the current Expo template — it throws when app/build.gradle
    // has no `configurations.all` block, and its preBuild hook calls
    // scripts/android/strip-play-edge-apis.js, which is not in the repo.
    // A test APK installed directly needs none of that. If this variant ever
    // goes to Play (with its own new signing certificate), revisit it then.
    // './plugins/withPlayRelease',
    ['expo-local-authentication', { faceIDPermission: 'Allow MemoAirem Test to use Face ID to unlock your private folder.' }],
    'expo-font',
  ],
};

export default config;
