/**
 * Built-in listening (branch feat/built-in-voice) — speech-to-text models running ON THE PHONE through
 * react-native-sherpa-onnx, as the backup (or, by choice, the only) recogniser. The file keeps its
 * name; since 1.12.0-voice.7 it holds more than one model, and the `whisper*` functions mean
 * "the ACTIVE built-in model".
 *
 *   - Whisper small.en (voice.3): 606 MB download; only the 8-bit encoder/decoder are kept (~375 MB).
 *     Self-test against the pack's trans.txt. Weak on accents (device report).
 *   - Parakeet TDT 0.6B v2 int8 (voice.7, NVIDIA, CC-BY-4.0): 482 MB download, ~660 MB on the phone
 *     (encoder/decoder/joiner + tokens). English. Tested here with sherpa-onnx 2.0.1: the pack's
 *     7.4 s clip word-perfect in 0.62 s (2 threads, warm). No transcript file in the pack — the
 *     expected text below is that verified output. Hotwords: accepted when pre-split into its word
 *     pieces, but no measurable effect yet — left out until tested on a real recording.
 *   - Each model is downloaded / removed separately into `listen/<pack>/`; one is ACTIVE
 *     (Settings → Listening; key `listen_model`). Only the active one is loaded in memory.
 *   - transcribeWavFile(path): the WAV Google recorded when it failed (cleaned first, see denoise.ts).
 *   - transcribeAudio(samples): audio captured directly. Longer than 28 s is split between words.
 *   - Never run on silence (hasSpeech); Whisper's phantom lines / sound labels are dropped.
 */
import {
  CachesDirectoryPath,
  DocumentDirectoryPath,
  downloadFile,
  exists,
  mkdir,
  readFile,
  stat,
  stopDownload,
  unlink,
  writeFile,
} from '@dr.pogodin/react-native-fs';
import { createSTT, type SttEngine, type STTInitializeOptions } from 'react-native-sherpa-onnx/stt';
import { extractArchive } from 'react-native-sherpa-onnx/extraction';
import { decodeAudioFileToFloatSamples } from 'react-native-sherpa-onnx/audio';
import { cleanRecording, ensureDenoiser, removeDenoiser, warmDenoiser } from './denoise';
import { loadListenModel, saveListenModel, type ListenModel } from './settings';

export type { ListenModel };

const RELEASE = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models';
const ROOT = `${DocumentDirectoryPath}/listen`;

interface ModelSpec {
  id: ListenModel;
  label: string;
  pack: string;
  /** Download size on GitHub (checked 2026-10-27). */
  bytes: number;
  /** Approx. size on the phone after unpacking, MB (for Settings text). */
  diskMb: number;
  keep: string[];
  drop: string[];
  /** Known transcript of test_wavs/0.wav when the pack has no trans.txt. */
  expected?: string;
  stt: (dir: string) => STTInitializeOptions;
}

export const LISTEN_MODELS: Record<ListenModel, ModelSpec> = {
  whisper: {
    id: 'whisper',
    label: 'Whisper small',
    pack: 'sherpa-onnx-whisper-small.en',
    bytes: 635_693_775,
    diskMb: 375,
    keep: ['small.en-encoder.int8.onnx', 'small.en-decoder.int8.onnx', 'small.en-tokens.txt'],
    drop: ['small.en-encoder.onnx', 'small.en-decoder.onnx'], // full-size copies, unused
    stt: (dir) => ({
      modelPath: { type: 'file', path: dir },
      modelType: 'whisper',
      preferInt8: true,
      numThreads: 4,
      modelOptions: { whisper: { language: 'en', task: 'transcribe' } },
    }),
  },
  parakeet: {
    id: 'parakeet',
    label: 'Parakeet',
    pack: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8',
    bytes: 482_468_385,
    diskMb: 660,
    keep: ['encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx', 'tokens.txt'],
    drop: [],
    expected:
      "Well, I don't wish to see it any more, observed Phebe, turning away her eyes. It is certainly very like the old portrait.",
    stt: (dir) => ({
      modelPath: { type: 'file', path: dir },
      modelType: 'nemo_transducer',
      preferInt8: true,
      numThreads: 4,
    }),
  },
};
const IDS: ListenModel[] = ['whisper', 'parakeet'];

const dirOf = (id: ListenModel) => `${ROOT}/${LISTEN_MODELS[id].pack}`;
const archiveOf = (id: ListenModel) => `${CachesDirectoryPath}/${LISTEN_MODELS[id].pack}.tar.bz2`;
const readyOf = (id: ListenModel) => `${dirOf(id)}/.memoairem-ready`;
export const modelUrl = (id: ListenModel) => `${RELEASE}/${LISTEN_MODELS[id].pack}.tar.bz2`;

/** Kept for older callers: the Whisper pack size. */
export const WHISPER_BYTES = LISTEN_MODELS.whisper.bytes;

/* ---------------- install state per model (observable, like lib/kokoro.ts) ---------------- */

export type WhisperStatus = 'unknown' | 'missing' | 'downloading' | 'unpacking' | 'testing' | 'ready' | 'error';

export interface SelfTest {
  ok: boolean;
  heard: string;
  expected: string;
  seconds: number;
}

export interface WhisperState {
  status: WhisperStatus;
  fraction: number;
  error: string | null;
  test: SelfTest | null;
}

const blank = (): WhisperState => ({ status: 'unknown', fraction: 0, error: null, test: null });
const states: Record<ListenModel, WhisperState> = { whisper: blank(), parakeet: blank() };
const listeners = new Set<() => void>();
let active: ListenModel = loadListenModel();

function setState(id: ListenModel, patch: Partial<WhisperState>): void {
  states[id] = { ...states[id], ...patch };
  for (const l of listeners) l();
}

export function modelState(id: ListenModel): WhisperState {
  return states[id];
}
export function subscribeModels(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function activeModel(): ListenModel {
  return active;
}
/** Make `id` the model that listens. Unloads the other one (memory). */
export function setActiveModel(id: ListenModel): void {
  if (id === active) return;
  active = id;
  saveListenModel(id);
  void destroyEngine();
  for (const l of listeners) l();
}

/** State of the ACTIVE built-in model. */
export function whisperState(): WhisperState {
  return states[active];
}
/** Synchronous "can the active built-in model transcribe right now?" */
export function whisperReady(): boolean {
  return states[active].status === 'ready';
}
export function modelLabel(id: ListenModel = active): string {
  return LISTEN_MODELS[id].label;
}

const busy = (id: ListenModel) => ['downloading', 'unpacking', 'testing'].includes(states[id].status);

async function allPresent(id: ListenModel): Promise<boolean> {
  for (const f of LISTEN_MODELS[id].keep) if (!(await exists(`${dirOf(id)}/${f}`))) return false;
  return true;
}

/** Check every model on disk. If the chosen one isn't installed but the other is, the other listens. */
export async function refreshWhisper(): Promise<WhisperState> {
  for (const id of IDS) {
    if (busy(id)) continue;
    try {
      const ok = (await exists(readyOf(id))) && (await allPresent(id));
      setState(id, { status: ok ? 'ready' : 'missing', fraction: 0, error: null });
    } catch {
      setState(id, { status: 'missing', fraction: 0, error: null });
    }
  }
  if (states[active].status !== 'ready') {
    const other = IDS.find((id) => states[id].status === 'ready');
    if (other) setActiveModel(other);
  }
  if (IDS.some((id) => states[id].status === 'ready')) void ensureDenoiser(); // the 0.5 MB cleaner rides along
  return states[active];
}

const jobs: Partial<Record<ListenModel, { download: number | null; abort: AbortController | null }>> = {};

/** Download, unpack, keep only what's used, then run the self-test. */
export async function installModel(id: ListenModel): Promise<void> {
  if (busy(id)) return;
  const spec = LISTEN_MODELS[id];
  const dir = dirOf(id);
  const archive = archiveOf(id);
  const job = (jobs[id] = { download: null as number | null, abort: null as AbortController | null });
  setState(id, { status: 'downloading', fraction: 0, error: null, test: null });
  try {
    await mkdir(ROOT);
    if (await exists(archive)) await unlink(archive);
    const dl = downloadFile({
      fromUrl: modelUrl(id),
      toFile: archive,
      progressInterval: 300,
      connectionTimeout: 30_000,
      readTimeout: 60_000,
      progress: (r) => {
        const total = r.contentLength > 0 ? r.contentLength : spec.bytes;
        setState(id, { fraction: Math.min(1, r.bytesWritten / total) });
      },
    });
    job.download = dl.jobId;
    const res = await dl.promise;
    job.download = null;
    if (states[id].status !== 'downloading') return; // cancelled
    if (res.statusCode < 200 || res.statusCode >= 300) throw new Error(`download failed (HTTP ${res.statusCode})`);
    const size = (await stat(archive)).size;
    if (size < spec.bytes * 0.9) throw new Error(`download incomplete (${Math.round(size / 1048576)} MB)`);

    setState(id, { status: 'unpacking', fraction: 0 });
    if (id === active) await destroyEngine();
    if (await exists(dir)) await unlink(dir);
    job.abort = new AbortController();
    const out = await extractArchive(
      { modelId: spec.pack, archivePath: archive, format: 'tar.bz2', fileSize: size },
      ROOT,
      {
        force: true,
        signal: job.abort.signal,
        showNotificationsEnabled: false,
        onProgress: (e) => setState(id, { fraction: Math.min(1, (e.percent || 0) / 100) }),
      },
    );
    job.abort = null;
    if (!out.success) throw new Error('unpacking stopped');
    if (!(await allPresent(id))) throw new Error('the speech pack is missing files');
    for (const f of spec.drop) await unlink(`${dir}/${f}`).catch(() => {});
    await unlink(archive).catch(() => {});
    await writeFile(readyOf(id), spec.pack, 'utf8');
    setState(id, { status: 'ready', fraction: 1, error: null });
    void ensureDenoiser();
    void selfTestModel(id);
  } catch (e: any) {
    job.download = null;
    job.abort = null;
    if (states[id].status === 'missing') return; // cancelled
    await unlink(archive).catch(() => {});
    setState(id, { status: 'error', error: String(e?.message ?? e), fraction: 0 });
  }
}

export function cancelInstall(id: ListenModel): void {
  const job = jobs[id];
  if (job?.download != null) stopDownload(job.download);
  job?.abort?.abort();
  delete jobs[id];
  setState(id, { status: 'missing', fraction: 0, error: null });
  void unlink(archiveOf(id)).catch(() => {});
}

export async function removeModel(id: ListenModel): Promise<void> {
  if (id === active) await destroyEngine();
  await unlink(dirOf(id)).catch(() => {});
  await unlink(archiveOf(id)).catch(() => {});
  setState(id, { status: 'missing', fraction: 0, error: null, test: null });
  const other = IDS.find((x) => states[x].status === 'ready');
  if (id === active && other) setActiveModel(other);
  if (!other) await removeDenoiser(); // no listener left — the cleaner goes too
}

/** Older names (the active model). */
export const installWhisper = () => installModel(active);
export const cancelWhisperInstall = () => cancelInstall(active);
export const removeWhisper = () => removeModel(active);

/* ---------------- engine (the active model only) ---------------- */

let engine: SttEngine | null = null;
let engineFor: ListenModel | null = null;
let opening: Promise<SttEngine> | null = null;

async function destroyEngine(): Promise<void> {
  const e = engine;
  engine = null;
  engineFor = null;
  opening = null;
  if (e) await e.destroy().catch(() => {});
}

async function getEngine(): Promise<SttEngine> {
  const id = active;
  if (engine && engineFor === id) return engine;
  if (engine) await destroyEngine();
  if (!opening) {
    opening = createSTT(LISTEN_MODELS[id].stt(dirOf(id))).then((e) => {
      engine = e;
      engineFor = id;
      return e;
    });
  }
  try {
    return await opening;
  } finally {
    opening = null;
  }
}

/** Load the active model ahead of time so the first result comes sooner. */
export function warmWhisper(): void {
  if (whisperReady()) warmDenoiser();
  if (!whisperReady() || (engine && engineFor === active) || opening) return;
  const t0 = Date.now();
  const name = modelLabel();
  void getEngine()
    .then(() => console.log(`[listen] ${name} loaded in ${Date.now() - t0} ms`))
    .catch((e) => console.log(`[listen] ${name} failed to load: ` + String(e?.message ?? e)));
}

/** Lines Whisper is known to invent from silence or noise. */
const PHANTOM = /^\s*(?:thank you(?: for watching)?|thanks for watching|you|bye|\.+)\s*[.!]?\s*$/i;
/**
 * Sound labels Whisper writes like subtitles (1.12.0-voice.5, device: "(wind blowing)"):
 * (wind blowing), [Music], [BLANK_AUDIO], *coughs*, ♪ … ♪. Removed wherever they appear — they are
 * never your words. MemoAirem's own text never needs brackets from speech.
 */
const SOUND_LABEL = /\([^)]*\)|\[[^\]]*\]|\*[^*]*\*|♪[^♪]*♪?|♫/g;

export function cleanTranscript(text: string): string {
  const t = (text || '')
    .replace(SOUND_LABEL, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,!?-]+$/, '')
    .trim();
  return PHANTOM.test(t) ? '' : t;
}

async function transcribeOne(samples: ArrayLike<number>, sampleRate: number): Promise<string> {
  const e = await getEngine();
  const r = await e.transcribeSamples(Array.from(samples), sampleRate);
  return cleanTranscript(r.text);
}

/**
 * Transcribe any length of audio. Whisper hears at most 30 s at a time, so longer audio is cut into
 * pieces of up to 28 s, each cut placed at the quietest moment of its last 8 s (between words).
 * Returns '' when there is no speech in it at all (Whisper is never run on silence).
 */
export async function transcribeAudio(samples: Float32Array | number[], sampleRate = 16000): Promise<string> {
  if (!hasSpeech(samples, sampleRate)) return '';
  const frame = Math.round(sampleRate / 10);
  const levels = frameLevels(samples, frame);
  const max = 28 * sampleRate;
  const n = samples.length;
  const parts: string[] = [];
  let start = 0;
  while (start < n) {
    let end = Math.min(n, start + max);
    if (end < n) {
      const f0 = Math.ceil((start + 20 * sampleRate) / frame);
      const f1 = Math.floor(end / frame);
      let best = f1 - 1;
      for (let f = f0; f < f1; f++) if (levels[f] < levels[best]) best = f;
      end = Math.max(start + frame, best * frame + Math.round(frame / 2));
    }
    const piece = samples.slice(start, end);
    if (peakLevel(piece, frame) > SPEECH_MIN) {
      const text = await transcribeOne(piece, sampleRate);
      if (text) parts.push(text);
    }
    start = end;
  }
  return parts.join(' ').trim();
}

/** Transcribe a recorded WAV (Google's saved recording). Deletes nothing — the caller owns the file. */
export async function transcribeWavFile(path: string): Promise<string> {
  const d = await decodeAudioFileToFloatSamples(path.replace(/^file:\/\//, ''), 16000);
  const sr = d.sampleRate || 16000;
  const t0 = Date.now();
  const clean = await cleanRecording(d.samples, sr); // background noise out first (voice.6)
  if (clean !== d.samples) console.log(`[listen] recording cleaned in ${Date.now() - t0} ms`);
  return transcribeAudio(Array.from(clean), sr);
}

/** The pack's test recording — straight through the engine (it is clean speech). */
async function transcribeTestWav(path: string): Promise<string> {
  const e = await getEngine();
  const r = await e.transcribeFile(path);
  return (r.text || '').replace(/\s+/g, ' ').trim();
}

/* ---------------- speech detection (keeps Whisper away from silence) ---------------- */

/**
 * Speech level floor (float PCM, -1..1). 1.12.0-voice.4: was 0.012 — too high. The library records
 * from Android's VOICE_RECOGNITION source, which has NO automatic gain (Google's recogniser boosts
 * its own), so normal speech at arm's length can sit around 0.01–0.03. The bar now follows the
 * room's own noise (× SPEECH_OVER_NOISE) and this is only the absolute minimum.
 */
const SPEECH_MIN = 0.0025;
const SPEECH_OVER_NOISE = 3.5;

function frameLevels(s: ArrayLike<number>, frame: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + frame <= s.length; i += frame) {
    let sum = 0;
    for (let j = i; j < i + frame; j++) sum += s[j] * s[j];
    out.push(Math.sqrt(sum / frame));
  }
  return out;
}

function peakLevel(s: ArrayLike<number>, frame: number): number {
  return frameLevels(s, frame).reduce((m, v) => (v > m ? v : m), 0);
}

/**
 * Is there speech in this audio? At least 0.3 s (three 100 ms frames) clearly above the recording's
 * own quiet parts (10th-percentile level × 3, capped so loud speech can't lift the bar out of reach)
 * and above SPEECH_MIN.
 */
export function hasSpeech(samples: ArrayLike<number>, sampleRate = 16000): boolean {
  const levels = frameLevels(samples, Math.round(sampleRate / 10));
  if (levels.length < 3) return false;
  const sorted = [...levels].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)];
  const threshold = speechBar(floor);
  return levels.filter((l) => l > threshold).length >= 3;
}

export function rms(chunk: Float32Array | number[]): number {
  let s = 0;
  for (let i = 0; i < chunk.length; i++) s += chunk[i] * chunk[i];
  return chunk.length ? Math.sqrt(s / chunk.length) : 0;
}

/**
 * Simple energy endpointing for direct capture: speech = clearly above the room's noise floor
 * (learned from the first ~300 ms). Returns updated state; `done` once speech was heard and then
 * `silenceMs` passed without it.
 */
/** The "this is speech" bar for a given noise level — capped so loud rooms can't lift it out of reach. */
export function speechBar(noise: number): number {
  return Math.max(SPEECH_MIN, Math.min(noise * SPEECH_OVER_NOISE, 0.05));
}

/**
 * Energy endpointing for direct capture (1.12.0-voice.4 rewrite). The noise estimate follows the
 * QUIETEST recent level: it drops at once to any quieter chunk and creeps up only slowly — so
 * talking straight away (no quiet start) can't teach it that your voice is "noise". Speech = 3
 * chunks in a row above the bar (~0.1 s, ignores clicks). `done` once speech was heard and then
 * `silenceMs` passed without it.
 */
export interface Endpoint {
  noise: number;
  frames: number;
  run: number;
  heardSpeech: boolean;
  lastSpeechAt: number;
  peak: number;
  /** voice.18: YOUR speaking level (running average of your speech chunks), 0 until heard. */
  voice: number;
}
export function newEndpoint(): Endpoint {
  return { noise: -1, frames: 0, run: 0, heardSpeech: false, lastSpeechAt: 0, peak: 0, voice: 0 };
}

/**
 * voice.18 (device: "background noise like someone talking from afar, or a hum — it thinks I'm still
 * talking and waits"). The noise cleaner removes hum but not a distant VOICE (that's speech too). Once
 * your own voice has been heard, only sound at least this share of YOUR level keeps the mic open —
 * someone across the room is typically 10–15 dB quieter (0.18–0.3×) than you at the phone.
 */
export const OWN_VOICE_SHARE = 0.35;
export function feedEndpoint(ep: Endpoint, level: number, now: number, silenceMs: number): { ep: Endpoint; done: boolean } {
  const n = { ...ep, frames: ep.frames + 1, peak: Math.max(ep.peak, level) };
  if (n.noise < 0) n.noise = Math.min(level, 0.01); // first chunk, never assumed louder than a quiet room
  else if (level < n.noise) n.noise = level;
  else n.noise += (level - n.noise) * 0.005;
  // before you've spoken: the room's bar; after: also at least OWN_VOICE_SHARE of your own level
  const bar = n.heardSpeech ? Math.max(speechBar(n.noise), n.voice * OWN_VOICE_SHARE) : speechBar(n.noise);
  if (level > bar) {
    n.run += 1;
    if (n.run >= 3) {
      n.heardSpeech = true;
      n.lastSpeechAt = now;
      n.voice = n.voice ? n.voice * 0.9 + level * 0.1 : level; // learn your level as you talk
    }
  } else {
    n.run = 0;
  }
  return { ep: n, done: n.heardSpeech && now - n.lastSpeechAt > silenceMs };
}

/* ---------------- self-test ---------------- */

/** Transcribe a model's own test recording and compare with its known transcript. */
export async function selfTestModel(id: ListenModel = active): Promise<SelfTest | null> {
  if (states[id].status !== 'ready') return null;
  if (id !== active) return null; // only the active model is loaded
  setState(id, { status: 'testing' });
  try {
    let expected = LISTEN_MODELS[id].expected ?? '';
    if (!expected) {
      try {
        const txt = await readFile(`${dirOf(id)}/test_wavs/trans.txt`, 'utf8');
        const line = txt.split(/\r?\n/).find((l) => /^0(\.wav)?\b/.test(l.trim())) ?? txt.split(/\r?\n/)[0] ?? '';
        expected = line.replace(/^\S+\s+/, '').trim();
      } catch {
        /* no transcript file — still time the run */
      }
    }
    const t0 = Date.now();
    const heard = await transcribeTestWav(`${dirOf(id)}/test_wavs/0.wav`);
    const seconds = (Date.now() - t0) / 1000;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
    const ok = !!heard && (!expected || overlap(norm(heard), norm(expected)) >= 0.7);
    const test = { ok, heard, expected, seconds };
    setState(id, { status: 'ready', test });
    console.log(`[listen] self-test ${modelLabel(id)}: ${seconds.toFixed(2)} s, ${ok ? 'ok' : 'MISMATCH'}`);
    return test;
  } catch (e: any) {
    const test = { ok: false, heard: '', expected: '', seconds: 0 };
    setState(id, { status: 'ready', test, error: 'Self-test failed: ' + String(e?.message ?? e) });
    return test;
  }
}
/** Older name. */
export const selfTestWhisper = () => selfTestModel(active);

/** Share of expected words found in the heard text (order-free) — a loose accuracy check. */
function overlap(heard: string, expected: string): number {
  const h = new Set(heard.split(' '));
  const words = expected.split(' ').filter(Boolean);
  if (!words.length) return 1;
  return words.filter((w) => h.has(w)).length / words.length;
}
