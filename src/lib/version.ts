/**
 * In-app version + "what's new" surface (the standalone About screen — tap the M logo).
 *
 * APP_VERSION / APP_BUILD are the DISPLAY copies. They must be bumped in sync with
 * the three native version sources on every release (see MEMOAIREM_MANIFEST.md §2):
 *   - app.config.ts            → version
 *   - package.json             → version
 *   - android/app/build.gradle → versionName (= APP_VERSION) + versionCode (= APP_BUILD)
 * (expo-constants would let us read this at runtime instead, but it's not installed
 * and isn't worth a native dependency for a version string.)
 *
 * What's new starts at Airem 2. Older About-screen lines are in
 * docs/whats-new-archive.md. CHANGELOG.md still records every build.
 * Add the next release above the Airem 2 entry. Do not paste the archive back.
 */
export const APP_VERSION = '2.0.1';
export const APP_BUILD = 149;

export interface ReleaseNote {
  version: string;
  lines: string[];
}

export const WHATS_NEW: ReleaseNote[] = [
  {
    version: '2.0.1 (build 149)',
    lines: ['The Next button in first-time setup can be pressed again. The bottom bar no longer covers it.'],
  },
  {
    version: '2.0.1 (build 148)',
    lines: ['Fixed the app closing during first-time setup, right when the first download started.'],
  },
  {
    version: '2.0.1 (build 147)',
    lines: [
      'Gemma answers sooner. Its set-up is now built while you are still speaking, which saves about 2 seconds.',
      'After an answer there is a small mic on the M, so you can always ask again.',
      'A spoken question stops by itself if no words are heard for 9 seconds, or after 25 seconds.',
    ],
  },
  {
    version: '2.0.1 (build 146)',
    lines: [
      'While you set up the app, Kokoro, then Parakeet, then Gemma download one at a time. You can keep going. If one stops, the app says so. They are optional. The best of MemoAirem needs all three.',
    ],
  },
  {
    version: '2.0.0 (build 145)',
    lines: ['Gemma downloads on this phone. No computer. A backup also keeps your Gemini key and Harbor link.'],
  },
  {
    version: '2.0.0 (build 144)',
    lines: ['A spoken answer stays on the screen while it is being said.'],
  },
  {
    version: '2.0.0 (build 143)',
    lines: ['A spoken answer no longer says the record id.'],
  },
  {
    version: '2.0.0 (build 142)',
    lines: ['An answer no longer closes the app when Gemma speaks it.'],
  },
  {
    version: '2.0.0 (build 141)',
    lines: ['The microphone can start again. Tap and speak.'],
  },
  {
    version: '2.0.0 (build 140)',
    lines: ['A pasted list saves in one step. One line says it is saved, and the spinner stops.'],
  },
  {
    version: '2.0.0 (build 139)',
    lines: ['Photo, File, and Text use the space under the tabs. Back to voice brings the microphone back.'],
  },
  {
    version: '2.0.0 (build 138)',
    lines: [
      'File: Paste a file or type. You can edit the text. Save file keeps each question and answer. Parse sends a paragraph to Gemini, and each fact comes back as its own entry.',
    ],
  },
  {
    version: '2.0.0 (build 137)',
    lines: ['File: Paste a text. Numbered questions with answers are saved one by one, and each can be searched.'],
  },
  {
    version: '2.0.0 (build 136)',
    lines: ['Pin it keeps the screen on, and the same item is here when you come back.'],
  },
  {
    version: '2.0.0 (build 135)',
    lines: ['Pin it replaces Hold. A pinned item shows an orange lock.'],
  },
  {
    version: '2.0.0 (build 134)',
    lines: ['The Private folder opens again. The listener’s code is kept when the release is protected.'],
  },
  {
    version: '2.0.0 (build 133)',
    lines: [
      'A private photo opens larger: pinch, or double-tap. Pin it keeps that item on screen, and opening another one asks for your fingerprint or PIN. A pinned item shows an orange lock.',
    ],
  },
  {
    version: '2.0.0 — Airem 2',
    lines: [
      'Airem version 2 is the brain of MemoAirem. It lives on this phone and needs no signal to decide what you meant, whether you asked or saved, and which record you need. Airem finds it for you. Gemma then speaks that answer in one sentence, using only the records Airem already chose. The listener hears you and turns speech into words, on the phone with no signal or online when there is one, and Airem corrects those words before it decides. Airem finds a named thing, a schedule, a follow-up, or a total. A photo, a file, or speech becomes a record, and a capture that cannot be read yet waits until a link is available. The private folder holds notes and documents, answers them by name, tag, or expiry, and keeps a photo at full size for a closer look and sharing. The password manager stores logins encrypted on the phone, opens them with a fingerprint or its own PIN, recovers them if that PIN is forgotten, backs them up and restores them, imports them from another manager, generates a new password, copies one briefly, hides it again, and fills it into another app only for the site it belongs to.',
    ],
  },
];
