/**
 * Open-source notices shown from About. Each line is a name, a licence, and a copyright.
 * The models are downloaded by the person (they are not inside the Play package) except
 * LiteRT-LM and the FFmpeg copy inside sherpa-onnx, which ship with the app.
 */

export interface Notice {
  name: string;
  license: string;
  copyright: string;
  detail?: string;
}

export interface NoticeGroup {
  title: string;
  items: Notice[];
}

export const NOTICES: NoticeGroup[] = [
  {
    title: 'Models and engines',
    items: [
      {
        name: 'Gemma 4',
        license: 'Apache-2.0',
        copyright: 'Copyright Google',
        detail: 'Optional download on the phone, once, from the published LiteRT file. It is not inside the Play package. After that it stays on the phone.',
      },
      {
        name: 'LiteRT-LM 0.18.0',
        license: 'Apache-2.0',
        copyright: 'Copyright Google',
        detail: 'Ships with the app so Gemma can run on the phone.',
      },
      {
        name: 'sherpa-onnx',
        license: 'Apache-2.0',
        copyright: 'Copyright Xiaomi Corporation and the k2-fsa contributors',
        detail: 'Runs Kokoro, Whisper, Parakeet, and the noise cleaner.',
      },
      {
        name: 'Kokoro',
        license: 'Apache-2.0',
        copyright: 'Copyright hexgrad',
        detail: 'The built-in speaking voice. Downloaded once from the sherpa-onnx release.',
      },
      {
        name: 'Parakeet TDT 0.6B v2',
        license: 'CC-BY-4.0',
        copyright: 'Copyright NVIDIA Corporation',
        detail: 'Credit NVIDIA. https://creativecommons.org/licenses/by/4.0/',
      },
      {
        name: 'Whisper',
        license: 'MIT',
        copyright: 'Copyright OpenAI',
        detail: 'The small English model, used through sherpa-onnx.',
      },
      {
        name: 'GTCRN',
        license: 'MIT',
        copyright: 'Copyright Xiaobin Rong',
        detail: 'The background-noise cleaner.',
      },
      {
        name: 'FFmpeg',
        license: 'LGPL-2.1-or-later',
        copyright: 'Copyright the FFmpeg developers',
        detail: 'Bundled, unmodified, through sherpa-onnx. Source: https://ffmpeg.org',
      },
    ],
  },
  {
    title: 'Fonts',
    items: [
      {
        name: 'Inter',
        license: 'OFL-1.1',
        copyright: 'Copyright The Inter Project Authors',
      },
      {
        name: 'Space Grotesk',
        license: 'OFL-1.1',
        copyright: 'Copyright The Space Grotesk Project Authors',
      },
      {
        name: 'Space Mono',
        license: 'OFL-1.1',
        copyright: 'Copyright The Space Mono Project Authors',
      },
    ],
  },
  {
    title: 'Libraries',
    items: [
      { name: 'React', license: 'MIT', copyright: 'Copyright Meta Platforms, Inc. and affiliates' },
      { name: 'React Native', license: 'MIT', copyright: 'Copyright Meta Platforms, Inc. and affiliates' },
      { name: 'Expo', license: 'MIT', copyright: 'Copyright Expo' },
      {
        name: 'Expo modules',
        license: 'MIT',
        copyright: 'Copyright 650 Industries, Inc.',
        detail:
          'Camera, clipboard, crypto, document picker, file system, font, image tools, local authentication, screen capture, secure store, sharing, speech, status bar, and system UI.',
      },
      { name: 'expo-speech-recognition', license: 'MIT', copyright: 'Copyright jamsch' },
      { name: 'react-native-sherpa-onnx', license: 'MIT', copyright: 'Copyright (c) 2026 XDcobra' },
      { name: 'react-native-mmkv', license: 'MIT', copyright: 'Copyright Marc Rousavy' },
      { name: 'react-native-svg', license: 'MIT', copyright: 'Copyright (c) 2015-2016 Horcrux' },
      { name: '@dr.pogodin/react-native-fs', license: 'MIT', copyright: 'Copyright Dr. Sergey Pogodin' },
      { name: '@react-native-community/netinfo', license: 'MIT', copyright: 'Copyright Matt Oakes' },
      { name: '@noble/ciphers and @noble/hashes', license: 'MIT', copyright: 'Copyright Paul Miller' },
      {
        name: '@expo-google-fonts',
        license: 'MIT and OFL-1.1',
        copyright: 'Copyright Expo Team',
        detail: 'The package that carries the fonts. The font files themselves are OFL-1.1.',
      },
    ],
  },
];
