/**
 * Built-in voice (branch feat/built-in-voice, 1.12.0-voice) — Kokoro v1.0 running INSIDE MemoAirem
 * through react-native-sherpa-onnx, so spoken answers no longer depend on Android's speech engine
 * (which ColorOS can stop, leaving "No on-device voices found" until the app restarts).
 *
 *   - Model: sherpa-onnx's `kokoro-multi-lang-v1_0` pack (Apache-2.0), 334 MB, downloaded ONCE from
 *     GitHub into the app's own files and unpacked on the phone. Fully offline afterwards.
 *   - Voices: the 28 English Kokoro v1.0 voices (American / British, female / male); we list a
 *     curated set. af_heart is the best-rated one and the default.
 *   - Dictionary: the pack has lexicon-us-en / lexicon-gb-en / lexicon-zh. The library picks
 *     `lexicon.txt` first (else alphabetically → gb-en), so we write lexicon.txt = US or UK to
 *     match the chosen voice, and re-open the engine when the accent changes.
 *   - Playback: the library's own PCM player (AudioTrack). Chunks are written IN ORDER (one promise
 *     chain); after the last chunk we wait a moment before stopping, because the library's stop
 *     flushes (discards) audio still in the buffer and would clip the end of the sentence.
 *   - Only `react-native-sherpa-onnx/tts` and `/extraction` are imported — never `/download`,
 *     which needs the background downloader (excluded from the build, see app.config.ts).
 */
import {
  CachesDirectoryPath,
  DocumentDirectoryPath,
  copyFile,
  downloadFile,
  exists,
  mkdir,
  stat,
  stopDownload,
  unlink,
  writeFile,
} from '@dr.pogodin/react-native-fs';
import { createStreamingTTS, type StreamingTtsEngine, type TtsStreamController } from 'react-native-sherpa-onnx/tts';
import { extractArchive } from 'react-native-sherpa-onnx/extraction';

export const KOKORO_PACK = 'kokoro-multi-lang-v1_0';
export const KOKORO_URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${KOKORO_PACK}.tar.bz2`;
/** Size of the pack on GitHub (checked 2026-10-27) — shown before downloading, and a sanity check. */
export const KOKORO_BYTES = 349_886_476;

const ROOT = `${DocumentDirectoryPath}/voices`;
const DIR = `${ROOT}/${KOKORO_PACK}`;
const ARCHIVE = `${CachesDirectoryPath}/${KOKORO_PACK}.tar.bz2`;
const READY = `${DIR}/.memoairem-ready`;
const REQUIRED = ['model.onnx', 'voices.bin', 'tokens.txt', 'lexicon-us-en.txt', 'lexicon-gb-en.txt', 'espeak-ng-data'];

/* ---------------- voices ---------------- */

export interface KokoroVoice {
  id: string; // Kokoro voice name
  sid: number; // speaker id in kokoro-multi-lang-v1_0 (sherpa-onnx scripts/kokoro/v1.0)
  label: string;
  accent: 'us' | 'gb';
  star?: boolean; // best-rated
}

/** Curated English voices of Kokoro v1.0 (ids from sherpa-onnx scripts/kokoro/v1.0/generate_voices_bin.py). */
export const KOKORO_VOICES: KokoroVoice[] = [
  { id: 'af_heart', sid: 3, label: 'Heart · US ♀', accent: 'us', star: true },
  { id: 'af_bella', sid: 2, label: 'Bella · US ♀', accent: 'us', star: true },
  { id: 'af_nicole', sid: 6, label: 'Nicole · US ♀', accent: 'us' },
  { id: 'af_sarah', sid: 9, label: 'Sarah · US ♀', accent: 'us' },
  { id: 'am_michael', sid: 16, label: 'Michael · US ♂', accent: 'us', star: true },
  { id: 'am_adam', sid: 11, label: 'Adam · US ♂', accent: 'us' },
  { id: 'am_liam', sid: 15, label: 'Liam · US ♂', accent: 'us' },
  { id: 'am_onyx', sid: 17, label: 'Onyx · US ♂', accent: 'us' },
  { id: 'bf_emma', sid: 21, label: 'Emma · UK ♀', accent: 'gb', star: true },
  { id: 'bf_isabella', sid: 22, label: 'Isabella · UK ♀', accent: 'gb' },
  { id: 'bm_george', sid: 26, label: 'George · UK ♂', accent: 'gb', star: true },
  { id: 'bm_lewis', sid: 27, label: 'Lewis · UK ♂', accent: 'gb' },
];
export const DEFAULT_KOKORO_VOICE = 'af_heart';

export function kokoroVoice(id: string | null | undefined): KokoroVoice {
  return KOKORO_VOICES.find((v) => v.id === id) ?? KOKORO_VOICES[0];
}

/* ---------------- install state (observable — the download outlives the Settings sheet) ---------------- */

export type KokoroStatus = 'unknown' | 'missing' | 'downloading' | 'unpacking' | 'ready' | 'error';

export interface KokoroState {
  status: KokoroStatus;
  fraction: number; // 0..1 for downloading / unpacking
  error: string | null;
}

let state: KokoroState = { status: 'unknown', fraction: 0, error: null };
const listeners = new Set<(s: KokoroState) => void>();

function setState(patch: Partial<KokoroState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l(state);
}

export function kokoroState(): KokoroState {
  return state;
}

export function subscribeKokoro(cb: (s: KokoroState) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Synchronous "can the built-in voice speak right now?" — used by speak(). */
export function kokoroReady(): boolean {
  return state.status === 'ready';
}

/** Check the files on disk (call at startup and when Settings opens). */
export async function refreshKokoro(): Promise<KokoroState> {
  if (state.status === 'downloading' || state.status === 'unpacking') return state;
  try {
    const ok = (await exists(READY)) && (await allPresent());
    setState({ status: ok ? 'ready' : 'missing', fraction: 0, error: null });
  } catch {
    setState({ status: 'missing', fraction: 0, error: null });
  }
  return state;
}

async function allPresent(): Promise<boolean> {
  for (const f of REQUIRED) if (!(await exists(`${DIR}/${f}`))) return false;
  return true;
}

let downloadJob: number | null = null;
let extractAbort: AbortController | null = null;

/** Download (334 MB) and unpack the Kokoro pack. Progress goes through subscribeKokoro. */
export async function installKokoro(): Promise<void> {
  if (state.status === 'downloading' || state.status === 'unpacking') return;
  setState({ status: 'downloading', fraction: 0, error: null });
  try {
    await mkdir(ROOT);
    if (await exists(ARCHIVE)) await unlink(ARCHIVE);

    const job = downloadFile({
      fromUrl: KOKORO_URL,
      toFile: ARCHIVE,
      progressInterval: 300,
      connectionTimeout: 30_000,
      readTimeout: 60_000,
      progress: (r) => {
        const total = r.contentLength > 0 ? r.contentLength : KOKORO_BYTES;
        setState({ fraction: Math.min(1, r.bytesWritten / total) });
      },
    });
    downloadJob = job.jobId;
    const res = await job.promise;
    downloadJob = null;
    if (kokoroState().status !== 'downloading') return; // cancelled while downloading
    if (res.statusCode < 200 || res.statusCode >= 300) throw new Error(`download failed (HTTP ${res.statusCode})`);
    const size = (await stat(ARCHIVE)).size;
    if (size < KOKORO_BYTES * 0.9) throw new Error(`download incomplete (${Math.round(size / 1048576)} MB)`);

    setState({ status: 'unpacking', fraction: 0 });
    await destroyEngine();
    if (await exists(DIR)) await unlink(DIR);
    extractAbort = new AbortController();
    const out = await extractArchive(
      { modelId: KOKORO_PACK, archivePath: ARCHIVE, format: 'tar.bz2', fileSize: size },
      ROOT,
      {
        force: true,
        signal: extractAbort.signal,
        showNotificationsEnabled: false,
        onProgress: (e) => setState({ fraction: Math.min(1, (e.percent || 0) / 100) }),
      },
    );
    extractAbort = null;
    if (!out.success) throw new Error('unpacking stopped');
    if (!(await allPresent())) throw new Error('the voice pack is missing files');

    await useLexicon('us');
    await writeFile(READY, KOKORO_PACK, 'utf8');
    await unlink(ARCHIVE).catch(() => {});
    setState({ status: 'ready', fraction: 1, error: null });
  } catch (e: any) {
    downloadJob = null;
    extractAbort = null;
    if (kokoroState().status === 'missing') return; // cancelled — not an error
    await unlink(ARCHIVE).catch(() => {});
    setState({ status: 'error', error: String(e?.message ?? e), fraction: 0 });
  }
}

export function cancelKokoroInstall(): void {
  if (downloadJob != null) stopDownload(downloadJob);
  extractAbort?.abort();
  downloadJob = null;
  extractAbort = null;
  setState({ status: 'missing', fraction: 0, error: null });
  void unlink(ARCHIVE).catch(() => {});
}

/** Delete the built-in voice from the phone (334 MB back). */
export async function removeKokoro(): Promise<void> {
  stopKokoro();
  await destroyEngine();
  await unlink(DIR).catch(() => {});
  await unlink(ARCHIVE).catch(() => {});
  setState({ status: 'missing', fraction: 0, error: null });
}

/* ---------------- engine ---------------- */

let engine: StreamingTtsEngine | null = null;
let engineAccent: 'us' | 'gb' | null = null;
let engineRate = 24000;
let opening: Promise<StreamingTtsEngine> | null = null;

/** lexicon.txt is picked before lexicon-*.txt — make it the accent's dictionary. */
async function useLexicon(accent: 'us' | 'gb'): Promise<void> {
  const target = `${DIR}/lexicon.txt`;
  if (await exists(target)) await unlink(target);
  await copyFile(`${DIR}/lexicon-${accent}-en.txt`, target);
}

async function destroyEngine(): Promise<void> {
  const e = engine;
  engine = null;
  engineAccent = null;
  opening = null;
  if (e) await e.destroy().catch(() => {});
}

async function getEngine(accent: 'us' | 'gb'): Promise<StreamingTtsEngine> {
  if (engine && engineAccent === accent) return engine;
  if (opening) {
    const e = await opening;
    if (engineAccent === accent) return e;
  }
  opening = (async () => {
    await destroyEngine();
    await useLexicon(accent);
    const e = await createStreamingTTS({
      modelPath: { type: 'file', path: DIR },
      modelType: 'kokoro',
      numThreads: 4,
    });
    engineRate = (await e.getSampleRate().catch(() => 24000)) || 24000;
    engine = e;
    engineAccent = accent;
    return e;
  })();
  try {
    return await opening;
  } finally {
    opening = null;
  }
}

/* ---------------- speaking ---------------- */

let session = 0;
let controller: TtsStreamController | null = null;
let speaking: StreamingTtsEngine | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Speak `text` with a Kokoro voice. Resolves when the speech has finished (or was stopped);
 * rejects on an engine error (the caller falls back to the phone's voice).
 */
export async function speakKokoro(text: string, voiceId: string, speed = 1.0): Promise<void> {
  if (!text.trim()) return;
  stopKokoro();
  const my = ++session;
  const v = kokoroVoice(voiceId);
  const e = await getEngine(v.accent);
  if (my !== session) return;
  await e.startPcmPlayer(engineRate, 1);
  speaking = e;
  let chain: Promise<void> = Promise.resolve();
  await new Promise<void>((resolve, reject) => {
    e.generateSpeechStream(text, { sid: v.sid, speed }, {
      onChunk: (c) => {
        if (my !== session || !c.samples?.length) return;
        chain = chain.then(() => e.writePcmChunk(c.samples)).catch(() => {});
      },
      onEnd: () => {
        // let the last buffered audio play out — stopping flushes whatever is still queued
        void chain
          .then(() => sleep(350))
          .then(async () => {
            if (my === session) {
              await e.stopPcmPlayer().catch(() => {});
              speaking = null;
            }
            resolve();
          });
      },
      onError: (err) => {
        void e.stopPcmPlayer().catch(() => {});
        if (my === session) speaking = null;
        reject(new Error(err?.message || 'built-in voice failed'));
      },
    })
      .then((c) => {
        controller = c;
      })
      .catch(reject);
  });
}

/** Stop any built-in speech now. */
export function stopKokoro(): void {
  session += 1;
  const c = controller;
  const e = speaking;
  controller = null;
  speaking = null;
  if (c) void c.cancel().catch(() => {});
  if (e) void e.stopPcmPlayer().catch(() => {});
}
