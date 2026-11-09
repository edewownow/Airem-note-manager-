/**
 * The AI link (Settings) — provider + API key + model. This is the ONLY place
 * the key lives on the device.
 *
 * TODO: for any multi-user/public release, move the key behind a proxy —
 * don't ship it in the client.
 */
import type { AiLink } from '../types';
import { KEYS, loadJSON, saveJSON, persist } from './persist';

export const DEFAULT_MODEL = 'gemini-2.5-flash';

const EMPTY: AiLink = { provider: 'gemini', apiKey: '', model: DEFAULT_MODEL };

export function loadAiLink(): AiLink {
  const v = loadJSON<Partial<AiLink>>(KEYS.aiLink, {});
  return {
    provider: 'gemini',
    apiKey: (v.apiKey ?? '').trim(),
    model: (v.model ?? '').trim() || DEFAULT_MODEL,
  };
}

export function saveAiLink(link: AiLink): void {
  saveJSON(KEYS.aiLink, {
    provider: 'gemini',
    apiKey: link.apiKey.trim(),
    model: link.model.trim() || DEFAULT_MODEL,
  });
}

/** Present → online features light up; absent → pure-offline, no nagging. */
export function isLinked(link: AiLink): boolean {
  return !!link.apiKey.trim();
}

/** First-run detection — checks the "ai_link" key (greenfield, not geminiKey). */
export function hasEverConfigured(): boolean {
  return persist.has(KEYS.aiLink) && !!loadAiLink().apiKey;
}

export const EMPTY_LINK = EMPTY;

/* ---------------- spoken-answer voice (Settings) ---------------- */
/** The chosen TTS voice identifier, or '' if none picked yet. */
export function loadVoice(): string {
  return (persist.getString(KEYS.voice) ?? '').trim();
}
export function saveVoice(identifier: string): void {
  persist.set(KEYS.voice, identifier);
}

/* ---------------- which engine speaks (feat/built-in-voice) ---------------- */
export type TtsEngineChoice = 'phone' | 'builtin';
/** 'phone' = Android's speech engine (default), 'builtin' = Kokoro inside MemoAirem. */
export function loadTtsEngine(): TtsEngineChoice {
  return persist.getString(KEYS.ttsEngine) === 'builtin' ? 'builtin' : 'phone';
}
export function saveTtsEngine(e: TtsEngineChoice): void {
  persist.set(KEYS.ttsEngine, e);
}
/** The chosen built-in (Kokoro) voice id, or '' for the default. */
export function loadKokoroVoice(): string {
  return (persist.getString(KEYS.kokoroVoice) ?? '').trim();
}
export function saveKokoroVoice(id: string): void {
  persist.set(KEYS.kokoroVoice, id);
}

/* ---------------- who listens (feat/built-in-voice, 1.12.0-voice.3) ---------------- */
export type ListenMode = 'google' | 'phone';
/**
 * 'google' = Google's recogniser first; the built-in Whisper (if installed) takes over when Google
 * fails or there is no signal. 'phone' = built-in Whisper only — speech never leaves the phone.
 */
export function loadListenMode(): ListenMode {
  return persist.getString(KEYS.listenMode) === 'phone' ? 'phone' : 'google';
}
export function saveListenMode(m: ListenMode): void {
  persist.set(KEYS.listenMode, m);
}
/** Clean background noise before the built-in listener (default on; '0' = off). */
export function loadListenDenoise(): boolean {
  return persist.getString(KEYS.listenDenoise) !== '0';
}
export function saveListenDenoise(on: boolean): void {
  persist.set(KEYS.listenDenoise, on ? '1' : '0');
}

/** Which built-in listener model listens (1.12.0-voice.7). Default Whisper (installed first). */
export type ListenModel = 'whisper' | 'parakeet';
export function loadListenModel(): ListenModel {
  return persist.getString(KEYS.listenModel) === 'parakeet' ? 'parakeet' : 'whisper';
}
export function saveListenModel(m: ListenModel): void {
  persist.set(KEYS.listenModel, m);
}

/* ---------------- categories (variant experiment) ---------------- */
/** Categories on/off. Default on when never set ('0' = off). */
export function loadCategoriesOn(): boolean {
  return persist.getString(KEYS.categoriesOn) !== '0';
}
export function saveCategoriesOn(on: boolean): void {
  persist.set(KEYS.categoriesOn, on ? '1' : '0');
}
