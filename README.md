# Airem-note-manager-

MemoAirem Test 2.0.1 — a separate test variant of MemoAirem, for experimenting with the core store-and-retrieve system (faster, more accurate, less noise). It installs alongside the real MemoAirem app (package `com.valle.memoairem.test`) and is not the Play release.

## What is here

- The variant code (Expo / React Native, 2.0.1 build 149)
- `design/` — the redesign direction: product truth, surface brief, interactive home mockup, icon sources
- `.github/workflows/build-apk.yml` — builds the test APK on GitHub, rendering the app icons from the SVG sources in `design/icons/`

## Notes

- The app runs on-device after a one-time model download; the Gemini key is optional, only for reading photos and files with AI.
