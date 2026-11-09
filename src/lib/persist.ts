/**
 * Low-level persistence — the single seam over the device key/value store.
 * Backed by react-native-mmkv v4 (default instance, id "default"), which is
 * created via the createMMKV() FACTORY — v4 removed the `new MMKV()` constructor.
 *
 * Everything persisted goes through here, so the backing store can change
 * (e.g. AsyncStorage fallback, or expo-sqlite for indexed history) without
 * touching store/log/queue/corrections/settings.
 *
 * UPGRADE SEAM: when record/image volume grows, move records + log to
 * expo-sqlite behind this same interface for real query indexing.
 */
import { createMMKV } from 'react-native-mmkv';

const mmkv = createMMKV(); // default instance ("default")

/** Persisted-data keys (greenfield — NOT the prototype's geminiKey/geminiModel). */
export const KEYS = {
  records: 'events',
  aiLink: 'ai_link',
  voice: 'voice', // selected TTS voice identifier (Settings)
  corrections: 'corrections',
  log: 'capturelog',
  queue: 'parsequeue',
  ttsEngine: 'tts_engine', // 'phone' | 'builtin' (feat/built-in-voice)
  kokoroVoice: 'kokoro_voice', // built-in voice id, e.g. 'af_heart'
  listenDenoise: 'listen_denoise', // '0' = don't clean background noise before the built-in listener
  listenMode: 'listen_mode', // 'google' | 'phone' — who recognises speech (feat/built-in-voice, voice.3)
  listenModel: 'listen_model', // built-in listener model: 'whisper' | 'parakeet' (voice.7)
  categoriesOn: 'categories_on', // '0' = categories off (tags are just text); anything else = on
} as const;

export const persist = {
  getString(key: string): string | undefined {
    return mmkv.getString(key);
  },
  set(key: string, value: string): void {
    mmkv.set(key, value);
  },
  delete(key: string): void {
    mmkv.remove(key); // v4 renamed delete() → remove()
  },
  has(key: string): boolean {
    return mmkv.contains(key);
  },
  getAllKeys(): string[] {
    return mmkv.getAllKeys();
  },
  /** Shrink the MMKV file after a bulk delete — MMKV never resizes itself (the test
   * device's file pre-grew to 128MB). Safe to call any time; best-effort. */
  trim(): void {
    try {
      mmkv.trim();
    } catch {
      /* ignore */
    }
  },
};

/** Load+parse JSON for a key, returning `fallback` on absence or parse error. */
export function loadJSON<T>(key: string, fallback: T): T {
  const raw = persist.getString(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Serialize+store JSON for a key (swallows write errors, like the prototype). */
export function saveJSON(key: string, value: unknown): void {
  try {
    persist.set(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
