/**
 * Background-noise cleaner for the built-in listener (1.12.0-voice.6) — GTCRN, a tiny (523 KB)
 * speech-enhancement model run on the phone through react-native-sherpa-onnx/enhancement.
 *
 *   - Fetched automatically, once, alongside the built-in listener (sherpa-onnx GitHub release
 *     `speech-enhancement-models`, gtcrn_simple.onnx — 535,638 bytes, checked 2026-10-27). Lives in
 *     `listen/denoise/`. If it's missing or fails, listening works exactly as before (raw audio).
 *   - Live: every mic chunk goes through the streaming cleaner (in order, one at a time) BEFORE the
 *     pause detection and before Whisper — so a fan / engine / crowd doesn't count as "still talking"
 *     and Whisper hears your voice, not the room. Measured with sherpa-onnx 2.0.1 + this model:
 *     steady noise 0.030 → 0.0009 (≈ −30 dB), speech 0.097 → 0.091 (kept), 3 s cleaned in 0.25 s.
 *   - Rescue: Google's saved recording is cleaned (offline engine) before Whisper reads it.
 *   - Settings → Listening → "Clean background noise" (default on) to compare with and without.
 */
import { DocumentDirectoryPath, downloadFile, exists, mkdir, moveFile, stat, unlink } from '@dr.pogodin/react-native-fs';
import {
  createEnhancement,
  createStreamingEnhancement,
  type EnhancementEngine,
  type OnlineEnhancementEngine,
} from 'react-native-sherpa-onnx/enhancement';
import { loadListenDenoise, saveListenDenoise } from './settings';

export const DENOISE_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/speech-enhancement-models/gtcrn_simple.onnx';
export const DENOISE_BYTES = 535_638;
const DIR = `${DocumentDirectoryPath}/listen/denoise`;
const FILE = `${DIR}/gtcrn_simple.onnx`;
const SR = 16000;

let enabled = loadListenDenoise();
let present = false;
let fetching: Promise<boolean> | null = null;

export function denoiseEnabled(): boolean {
  return enabled;
}
export function setDenoiseEnabled(on: boolean): void {
  enabled = on;
  saveListenDenoise(on);
}
/** Model on the phone AND switched on. */
export function denoiseActive(): boolean {
  return enabled && present;
}
export function denoisePresent(): boolean {
  return present;
}

/** Make sure the model is on the phone — downloads it (0.5 MB) if missing. Never throws. */
export function ensureDenoiser(): Promise<boolean> {
  if (present) return Promise.resolve(true);
  if (fetching) return fetching;
  fetching = (async () => {
    try {
      if ((await exists(FILE)) && (await stat(FILE)).size === DENOISE_BYTES) {
        present = true;
        return true;
      }
      await mkdir(DIR);
      const tmp = `${FILE}.part`;
      await unlink(tmp).catch(() => {});
      const res = await downloadFile({ fromUrl: DENOISE_URL, toFile: tmp, connectionTimeout: 20_000, readTimeout: 30_000 })
        .promise;
      const size = (await stat(tmp)).size;
      if (res.statusCode < 200 || res.statusCode >= 300 || size !== DENOISE_BYTES) {
        await unlink(tmp).catch(() => {});
        console.log(`[listen] noise cleaner download failed (HTTP ${res.statusCode}, ${size} bytes)`);
        return false;
      }
      await unlink(FILE).catch(() => {});
      await moveFile(tmp, FILE);
      present = true;
      console.log('[listen] noise cleaner installed');
      return true;
    } catch (e: any) {
      console.log('[listen] noise cleaner unavailable: ' + String(e?.message ?? e));
      return false;
    } finally {
      fetching = null;
    }
  })();
  return fetching;
}

export async function removeDenoiser(): Promise<void> {
  await closeEngines();
  present = false;
  await unlink(DIR).catch(() => {});
}

/* ---------------- engines (opened on first use, kept while the app runs) ---------------- */

let live: OnlineEnhancementEngine | null = null;
let offline: EnhancementEngine | null = null;

async function closeEngines(): Promise<void> {
  const a = live;
  const b = offline;
  live = null;
  offline = null;
  if (a) await a.destroy().catch(() => {});
  if (b) await b.destroy().catch(() => {});
}

const config = () => ({ modelPath: { type: 'file' as const, path: DIR }, modelType: 'gtcrn' as const, numThreads: 1 });

/** Load the cleaner ahead of time (with the listener) so the first chunk isn't delayed. */
export function warmDenoiser(): void {
  if (!denoiseActive() || live) return;
  void createStreamingEnhancement(config())
    .then((e) => {
      live = e;
    })
    .catch((e) => console.log('[listen] noise cleaner failed to load: ' + String(e?.message ?? e)));
}

/**
 * A cleaner for one listening session. feed() must be awaited in order (the caller chains them);
 * flush() returns the last few milliseconds still inside the model.
 */
export interface LiveCleaner {
  feed(chunk: Float32Array): Promise<Float32Array>;
  flush(): Promise<Float32Array>;
}

export async function openLiveCleaner(): Promise<LiveCleaner | null> {
  if (!denoiseActive()) return null;
  try {
    if (!live) live = await createStreamingEnhancement(config());
    const e = live;
    await e.reset();
    return {
      feed: async (chunk) => (await e.feedSamples(Array.from(chunk), SR)).samples,
      flush: async () => (await e.flush()).samples,
    };
  } catch (err: any) {
    console.log('[listen] noise cleaner failed to open: ' + String(err?.message ?? err));
    live = null;
    return null;
  }
}

/** Clean a whole recording (Google's saved WAV). Returns the input unchanged if cleaning isn't possible. */
export async function cleanRecording(samples: ArrayLike<number>, sampleRate: number): Promise<ArrayLike<number>> {
  if (!denoiseActive() || sampleRate !== SR || !samples.length) return samples;
  try {
    if (!offline) offline = await createEnhancement(config());
    const out = await offline.enhanceSamples(Array.from(samples), SR);
    return out.samples.length ? out.samples : samples;
  } catch (e: any) {
    console.log('[listen] noise cleaner failed on the recording: ' + String(e?.message ?? e));
    return samples;
  }
}
