/**
 * Speech — TTS (expo-speech) and STT (expo-speech-recognition) behind one
 * module. Voice is just another way to produce text for the existing parse and
 * query paths.
 *
 * NOTE (brief correction): voice-IN is BEST-EFFORT, not part of the offline-first
 * guarantee. Android STT often routes through an online recognizer; on-device
 * availability is device-dependent. Typed input is always the reliable path.
 * Spoken answers (TTS) work offline with system voices.
 */
import { useCallback, useRef } from 'react';
import * as Speech from 'expo-speech';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { unlink } from '@dr.pogodin/react-native-fs';
import { createPcmLiveStream, type PcmLiveStreamHandle } from 'react-native-sherpa-onnx/audio';
import { fetchOnline } from './connectivity';
import { denoiseEnabled, openLiveCleaner, type LiveCleaner } from './denoise';
import { sayYears } from './sayYears';
import { DEFAULT_KOKORO_VOICE, kokoroReady, refreshKokoro, speakKokoro, stopKokoro } from './kokoro';
import {
  loadKokoroVoice,
  loadListenMode,
  loadTtsEngine,
  saveKokoroVoice,
  saveListenMode,
  saveTtsEngine,
  type ListenMode,
  type TtsEngineChoice,
} from './settings';
import {
  feedEndpoint,
  newEndpoint,
  refreshWhisper,
  rms,
  speechBar,
  transcribeAudio,
  transcribeWavFile,
  warmWhisper,
  whisperReady,
  whisperState,
  modelLabel,
  type Endpoint,
} from './whisper';
import { listWords } from './learning';
import { shapeHeard, listenHints } from './hear';
import { store } from './store';

/* ---------------- TTS (spoken answers) ---------------- */
export type Voice = Speech.Voice;

/* ---------------- voices: one choice per voice, best copy at speak time (1.8.1) ----------------
 * Android's Google engine lists each voice TWICE: "en-us-x-iob-local" (offline, on the phone) and
 * "en-us-x-iob-network" (online, noticeably more natural). expo-speech exposes only the name and a
 * quality flag (ENHANCED = above Android's normal quality) — the name suffix is what tells the copies
 * apart. So the picker shows ONE chip per voice, and speak() resolves the stored choice to the
 * network copy when online and the local copy when offline. Other engines' voices pass through as-is.
 */
const GOOGLE_VOICE = /^([a-z]{2,3})-([a-z]{2,3})-x-([a-z0-9]+)-(local|network)$/i;

let voiceCache: Voice[] = [];

export function listVoices(): Promise<Voice[]> {
  return Speech.getAvailableVoicesAsync()
    .then((vs) => {
      if (vs.length) voiceCache = vs; // never cache an empty (engine reloading) list
      return vs;
    })
    .catch(() => []);
}

export interface VoiceChoice {
  key: string; // stable id for the voice (Google: "en-us-x-iob"; others: the identifier)
  label: string; // chip text, e.g. "US · IOB"
  hq: boolean; // any copy is high quality
  local: string | null; // offline copy identifier
  network: string | null; // online copy identifier
  other: string | null; // a non-Google voice identifier
}

const REGION: Record<string, string> = {
  us: 'US', gb: 'UK', au: 'Australia', in: 'India', ca: 'Canada', ie: 'Ireland', ng: 'Nigeria',
  za: 'South Africa', nz: 'New Zealand', ph: 'Philippines', sg: 'Singapore',
};

/** The choice key a stored voice identifier belongs to. */
export function voiceKey(identifier: string): string {
  const m = GOOGLE_VOICE.exec(identifier);
  return m ? `${m[1]}-${m[2]}-x-${m[3]}`.toLowerCase() : identifier;
}

/** English voices grouped one-per-voice, high quality first, then US, then by name. */
export function groupVoices(vs: Voice[]): VoiceChoice[] {
  const en = vs.filter((v) => /^en(-|_|$)/i.test(v.language));
  const pool = en.length ? en : vs;
  const byKey = new Map<string, VoiceChoice>();
  const hasGoogle = pool.some((v) => GOOGLE_VOICE.test(v.identifier));
  for (const v of pool) {
    const m = GOOGLE_VOICE.exec(v.identifier);
    // "en-US-language" style entries are aliases of a default voice — skip them when real ones exist
    if (!m && hasGoogle && /-language$/i.test(v.identifier)) continue;
    const key = voiceKey(v.identifier);
    let c = byKey.get(key);
    if (!c) {
      const label = m
        ? `${REGION[m[2].toLowerCase()] ?? m[2].toUpperCase()} · ${m[3].toUpperCase()}`
        : (v.name || v.identifier).replace(/\s*\(.*\)$/, '');
      c = { key, label, hq: false, local: null, network: null, other: null };
      byKey.set(key, c);
    }
    if (v.quality === Speech.VoiceQuality.Enhanced) c.hq = true;
    if (m) c[m[4].toLowerCase() === 'network' ? 'network' : 'local'] = v.identifier;
    else c.other = v.identifier;
  }
  const isUS = (c: VoiceChoice) => /^en-us/i.test(c.key) || /\bUS\b/.test(c.label);
  return [...byKey.values()].sort(
    (a, b) => +b.hq - +a.hq || +isUS(b) - +isUS(a) || a.label.localeCompare(b.label),
  );
}

/** The identifier to store for a choice (offline copy first — it works everywhere). */
export function choiceId(c: VoiceChoice): string {
  return c.local ?? c.other ?? c.network ?? c.key;
}

/** Default voice: the first grouped choice (high quality, US English first). */
export function pickBestVoice(voices: Voice[]): Voice | null {
  const best = groupVoices(voices)[0];
  if (!best) return null;
  const id = choiceId(best);
  return voices.find((v) => v.identifier === id) ?? null;
}

/**
 * The copy to actually speak with: online → the network copy (better), offline → the local copy.
 * Falls back to whatever exists, and to the stored id itself if the engine list isn't loaded yet.
 */
export function resolveVoice(identifier: string | undefined, online: boolean): string | undefined {
  if (!identifier) return undefined;
  const key = voiceKey(identifier);
  const c = groupVoices(voiceCache).find((x) => x.key === key);
  if (!c) return identifier;
  return (online ? c.network ?? c.local : c.local ?? c.network) ?? c.other ?? identifier;
}

/* ---------------- which engine speaks (feat/built-in-voice) ----------------
 * 'phone'   → Android's engine (expo-speech) as before. If it hasn't STARTED within PHONE_START_MS
 *             (ColorOS stopped the engine, voices "not found" …) and the built-in voice is installed,
 *             the same words are spoken by the built-in voice instead — no more silent answers.
 * 'builtin' → Kokoro inside MemoAirem (lib/kokoro.ts); if it errors, the phone's voice speaks.
 * Every call cancels whatever was speaking before. */

let engineChoice: TtsEngineChoice = loadTtsEngine();
let builtinVoice: string = loadKokoroVoice() || DEFAULT_KOKORO_VOICE;
void refreshKokoro(); // is the built-in voice on the phone? (async file check at startup)

/** Phone engine silent this long → the built-in voice takes over (when installed). */
const PHONE_START_MS = 4000;
let speakToken = 0;
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

export function ttsEngine(): TtsEngineChoice {
  return engineChoice;
}
export function setTtsEngine(e: TtsEngineChoice): void {
  engineChoice = e;
  saveTtsEngine(e);
}
export function builtinVoiceId(): string {
  return builtinVoice;
}
export function setBuiltinVoice(id: string): void {
  builtinVoice = id;
  saveKokoroVoice(id);
}

function clearFallback(): void {
  if (fallbackTimer) clearTimeout(fallbackTimer);
  fallbackTimer = null;
}

function speakPhone(text: string, voiceIdentifier: string | undefined, online: boolean, token: number): void {
  let started = false;
  try {
    Speech.speak(text, {
      voice: resolveVoice(voiceIdentifier, online),
      rate: 0.96, // a touch slower reads more natural than the default
      pitch: 1.0,
      onStart: () => {
        started = true;
        clearFallback();
      },
      onError: () => {
        if (token === speakToken && kokoroReady()) {
          clearFallback();
          void speakKokoro(text, builtinVoice).catch(() => {});
        }
      },
    });
  } catch {
    /* ignore — the fallback below still runs */
  }
  if (kokoroReady()) {
    fallbackTimer = setTimeout(() => {
      fallbackTimer = null;
      if (!started && token === speakToken) {
        Speech.stop().catch(() => {});
        void speakKokoro(text, builtinVoice).catch(() => {});
      }
    }, PHONE_START_MS);
  }
}

/** Speak `text`. Pass `online` so the best copy of the chosen PHONE voice is used (see resolveVoice). */
export function speak(text: string, voiceIdentifier?: string, online = false): void {
  if (!text) return;
  text = sayYears(text); // "June 12, 1898" is said "eighteen ninety-eight"
  const token = ++speakToken;
  clearFallback();
  Speech.stop().catch(() => {});
  stopKokoro();
  if (engineChoice === 'builtin' && kokoroReady()) {
    speakKokoro(text, builtinVoice).catch(() => {
      if (token === speakToken) speakPhone(text, voiceIdentifier, online, token);
    });
    return;
  }
  speakPhone(text, voiceIdentifier, online, token);
}

/** Speak with a specific built-in voice (Settings preview). */
export function previewBuiltin(text: string, voiceId: string): Promise<void> {
  ++speakToken;
  clearFallback();
  Speech.stop().catch(() => {});
  return speakKokoro(text, voiceId);
}

export function stopSpeaking(): void {
  ++speakToken;
  clearFallback();
  Speech.stop().catch(() => {});
  stopKokoro();
}

/* ---------------- STT (voice input) ---------------- */

/**
 * Listening-window tuning for VOICE CAPTURE (the long, continuous path). Defaults left the
 * Android system recognizer's own (short) silence endpointing in charge, which cut a capture off
 * mid-sentence on a natural pause. These widen the window.
 *
 * KNOWN ANDROID LIMITATION: the native Android recognizer enforces its OWN silence/endpointing
 * behavior and MAY NOT fully honor these app-level values — the platform docs for the EXTRA_*_
 * SILENCE intents say "depending on the recognizer implementation, these values may have no
 * effect." So on some devices/ROMs the window can STILL be shorter than requested. We tune toward
 * "better", NOT a guaranteed duration; the hard ceiling below is the only value we fully control.
 * The instruction mic uses the same window. A 1.5 s pause was ending it mid-sentence, so the
 * last words never arrived.
 */
const SILENCE_COMPLETE_MS = 3000; // after speech stops, wait this long before ending the session
const SILENCE_POSSIBLY_MS = 3000; // tolerance for natural mid-thought pauses (don't cut early)
const MIN_LISTEN_MS = 2000; // don't end before this — avoids an instant cut right at the start
const MAX_LISTEN_MS = 60000; // app-level HARD ceiling (we control this) so it can't listen forever
// A spoken QUESTION is short. Google can sit "listening" for a minute hearing no words (the log shows
// one empty result after another), so asking has its own, much shorter limits.
const ASK_NO_WORDS_MS = 9000; // no words at all by now → stop
const ASK_MAX_MS = 25000; // a question never needs longer than this

export interface STTHandlers {
  onText: (transcript: string, isFinal: boolean) => void;
  onEnd?: () => void;
  onError?: (code: string) => void;
  onStart?: () => void;
}

/* ---------------- who listens: Google first, built-in Whisper as backup (1.12.0-voice.3) ----------------
 *
 *   Online, "Google first" (default), Whisper installed:
 *     Google listens as before, but expo-speech-recognition also RECORDS the audio it hears
 *     (recordingOptions.persist — 16 kHz WAV, Android 13+). If Google fails with an error Whisper can
 *     cover (network, server busy, no match, …), the error is HELD: when the recording is handed over
 *     ('audioend'), Whisper transcribes it on the phone and the text is delivered as a final result.
 *     Only if Whisper hears nothing does the original error reach the screen. When Google succeeds,
 *     the recording is deleted.
 *   Offline, or "Phone only", or a private (onDeviceOnly) mic — Whisper installed:
 *     MemoAirem records directly (sherpa-onnx PCM stream, 16 kHz) and stops by itself after a pause
 *     (3 s asking or capturing) or when the mic is tapped; Whisper then transcribes it. No partial
 *     text while speaking — the words appear once, a moment after you stop.
 *   Whisper not installed: exactly the old behaviour.
 */
let listenMode: ListenMode = loadListenMode();
// Load the listener a few seconds after launch (if installed) so the first answer isn't slowed by
// opening the ~370 MB model (1.12.0-voice.4).
void refreshWhisper().then(() => setTimeout(warmWhisper, 4000));

/**
 * Listening diagnostics (1.12.0-voice.4, test builds): `adb logcat -s ReactNativeJS` shows lines
 * starting "[listen]" — which path ran, mic levels, pause detection, timings. Never the words.
 */
function dlog(msg: string): void {
  console.log('[listen] ' + msg);
}
const f3 = (x: number) => x.toFixed(4);

/**
 * 1.13.0 (user's choice: "keep Google, warn in app + policy"): when the last listen went to Google's
 * online recogniser, the private folder warns that a secret said on the main mic was heard by Google.
 */
let lastCloudListen = 0;
export function heardByCloudRecently(withinMs = 120_000): boolean {
  return lastCloudListen > 0 && Date.now() - lastCloudListen < withinMs;
}

export function listenModeChoice(): ListenMode {
  return listenMode;
}
export function setListenMode(m: ListenMode): void {
  listenMode = m;
  saveListenMode(m);
}

/** Google errors the saved recording can rescue (not permission / mic / user-cancel ones). */
const WHISPER_RESCUE = new Set([
  'network',
  'language-not-supported',
  'service-not-allowed',
  'busy',
  'too-many-requests',
  'client',
  'unknown',
  'no-speech',
  'speech-timeout',
]);
const RECORDING_WAIT_MS = 3000;
/**
 * How long the instruction mic keeps listening after the words stop changing (online) or after
 * your voice drops (on this phone). A hum still cannot hold it open. 1.5 s was cutting a
 * sentence off while you were still speaking.
 */
const WORDS_STILL_MS = 3000;
const DIRECT_PAUSE_MS = { ask: 3000, capture: 3000 };
const DIRECT_NO_SPEECH_MS = { ask: 7000, capture: 10000 };

function deleteFile(uri: string | null | undefined): void {
  if (!uri) return;
  void unlink(uri.replace(/^file:\/\//, '')).catch(() => {});
}

function joinChunks(chunks: Float32Array[]): Float32Array {
  let n = 0;
  for (const c of chunks) n += c.length;
  const out = new Float32Array(n);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

interface DirectSession {
  sid: number;
  stream: PcmLiveStreamHandle;
  offs: (() => void)[];
  chunks: Float32Array[];
  ep: Endpoint;
  continuous: boolean;
  startedAt: number;
  finishing: boolean;
  /** Background-noise cleaner (voice.6) — null = raw audio. Chunks pass through it strictly in order. */
  cleaner: LiveCleaner | null;
  chain: Promise<void>;
  rawPeak: number;
}

/**
 * Voice-to-text hook. Registers recognizer event listeners and returns start/stop. `continuous` true
 * keeps listening (capture); false is one-shot (query). Best-effort: requests permission, fails
 * gracefully. stop() returns true when a result is still coming (Whisper is transcribing) — the
 * caller should keep its text target until onEnd/onError.
 */
export function useSpeechToText(handlers: STTHandlers) {
  // App-level hard ceiling on a capture session (the only listening-window value we fully
  // control; see MAX_LISTEN_MS). Cleared whenever the recognizer ends, errors, or is stopped.
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noWordsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearMaxTimer = () => {
    if (maxTimer.current) {
      clearTimeout(maxTimer.current);
      maxTimer.current = null;
    }
    if (noWordsTimer.current) {
      clearTimeout(noWordsTimer.current);
      noWordsTimer.current = null;
    }
  };

  // True while start() is tearing down a previous (possibly wedged) session before launching a
  // new one. It swallows ONLY the recognizer 'end'/'error' EVENTS emitted by that cleanup-abort,
  // so tearing down the old session can't reset the NEW session's listening state. It never gates
  // our direct handlers.onError() calls (permission/exception), so real failures still surface.
  const suppressTerm = useRef(false);

  // Latest handlers for async completions (Whisper finishes after the render that started it).
  const h = useRef(handlers);
  h.current = handlers;

  // voice.18: one-shot Google session — finish when the words stop changing (see 'result')
  const oneShot = useRef(false);
  const lastWords = useRef('');
  const hints = useRef<string[]>([]);
  const stillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearStill = () => {
    if (stillTimer.current) clearTimeout(stillTimer.current);
    stillTimer.current = null;
  };

  // Session counter: every start/teardown bumps it, so a late Whisper result from an older
  // session is dropped instead of landing in the new one.
  const session = useRef(0);
  // Google session that is recording for a Whisper rescue.
  const armed = useRef(false);
  const savedUri = useRef<string | null>(null);
  const held = useRef<{
    sid: number;
    code: string;
    timer: ReturnType<typeof setTimeout> | null;
    running: boolean;
    endSeen: boolean;
  } | null>(null);
  // Google's own 'end' still to come for a session we already closed (rescue finished first).
  const skipEnd = useRef(false);
  // Direct (Whisper-only) recording.
  const direct = useRef<DirectSession | null>(null);

  const dropHeld = () => {
    const p = held.current;
    if (p?.timer) clearTimeout(p.timer);
    held.current = null;
  };

  const stopDirect = (d: DirectSession) => {
    d.finishing = true;
    for (const off of d.offs) off();
    d.offs = [];
    return d.stream.stop().catch(() => {});
  };

  // The single idempotent teardown. Safe on ANY exit path and when already idle: clears the
  // ceiling timer, drops any held Google error / running Whisper result / direct recording, and
  // force-releases the native recognizer (abort) so a busy/stuck recognizer from a failed capture
  // can't wedge the next one. This is the routine ALL paths funnel through.
  const teardown = () => {
    session.current++;
    clearMaxTimer();
    clearStill();
    oneShot.current = false;
    lastWords.current = '';
    dropHeld();
    skipEnd.current = false;
    armed.current = false;
    deleteFile(savedUri.current);
    savedUri.current = null;
    const d = direct.current;
    direct.current = null;
    if (d && !d.finishing) void stopDirect(d);
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      /* already idle / nothing to release */
    }
  };

  /* ---- Google failed: Whisper transcribes Google's own recording ---- */
  const rescue = async (uri: string) => {
    const p = held.current;
    if (!p || p.running) return;
    p.running = true;
    const t0 = Date.now();
    dlog(`rescue: Google failed (${p.code}) → ${modelLabel()} on the recording`);
    if (p.timer) clearTimeout(p.timer);
    p.timer = null;
    savedUri.current = null;
    let text = '';
    try {
      text = await transcribeWavFile(uri);
    } catch {
      text = '';
    }
    deleteFile(uri);
    dlog(`rescue: done in ${Date.now() - t0} ms, ${text ? text.split(' ').length + ' words' : 'nothing heard'}`);
    if (held.current !== p || session.current !== p.sid) return; // a newer session took over
    held.current = null;
    armed.current = false;
    if (!p.endSeen) skipEnd.current = true;
    if (text) {
      h.current.onText(shapeHeard([text], hints.current), true);
      h.current.onEnd?.();
    } else {
      h.current.onError?.(p.code);
    }
  };

  useSpeechRecognitionEvent('start', () => handlers.onStart?.());
  useSpeechRecognitionEvent('result', (e) => {
    const transcript = shapeHeard(
      (e.results ?? []).map((r) => r.transcript),
      hints.current,
    );
    handlers.onText(transcript, !!e.isFinal);
    // A hum or a distant voice can keep Google listening, because it makes no new words. Once the
    // words have stopped changing for WORDS_STILL_MS, finish. Long enough for a breath mid-instruction.
    if (!oneShot.current || e.isFinal) {
      clearStill();
      return;
    }
    const words = transcript.trim();
    if (!words || words === lastWords.current) return;
    lastWords.current = words;
    clearStill();
    const sid = session.current;
    stillTimer.current = setTimeout(() => {
      stillTimer.current = null;
      if (session.current !== sid || !oneShot.current) return;
      dlog(`google: words unchanged for ${WORDS_STILL_MS} ms → finishing`);
      try {
        ExpoSpeechRecognitionModule.stop(); // Google then sends the final words and ends
      } catch {
        /* already ending */
      }
    }, WORDS_STILL_MS);
  });
  useSpeechRecognitionEvent('audioend', (e) => {
    const uri = e?.uri ?? null;
    if (!uri) return;
    if (held.current) void rescue(uri);
    else savedUri.current = uri; // kept until 'end' in case an error follows
  });
  useSpeechRecognitionEvent('end', () => {
    clearMaxTimer();
    clearStill();
    if (suppressTerm.current) return; // cleanup-abort of a prior session — not a real end
    if (held.current) {
      held.current.endSeen = true; // Whisper is rescuing this session — it reports the end itself
      return;
    }
    if (skipEnd.current) {
      skipEnd.current = false; // this session already ended through Whisper
      return;
    }
    armed.current = false;
    deleteFile(savedUri.current); // Google succeeded — the backup recording isn't needed
    savedUri.current = null;
    handlers.onEnd?.();
  });
  useSpeechRecognitionEvent('error', (e) => {
    clearMaxTimer();
    clearStill();
    if (suppressTerm.current) return; // swallow the cleanup-abort's 'aborted'/error
    if (armed.current && whisperReady() && WHISPER_RESCUE.has(e.error) && !held.current) {
      const sid = session.current;
      const timer = setTimeout(() => {
        // Google never handed over a recording — give up and show its error.
        const p = held.current;
        if (!p || p.running || p.sid !== sid) return;
        dlog(`rescue: no recording from Google within ${RECORDING_WAIT_MS} ms → showing ${p.code}`);
        held.current = null;
        armed.current = false;
        if (!p.endSeen) skipEnd.current = true;
        h.current.onError?.(p.code);
      }, RECORDING_WAIT_MS);
      held.current = { sid, code: e.error, timer, running: false, endSeen: false };
      if (savedUri.current) void rescue(savedUri.current);
      return;
    }
    handlers.onError?.(e.error);
  });

  /* ---- direct recording, Whisper only ---- */
  const finishDirect = async (d: DirectSession, transcribe: boolean, failCode = 'no-speech') => {
    if (d.finishing) return;
    await stopDirect(d);
    clearMaxTimer();
    await d.chain; // chunks still inside the cleaner are the end of what you said
    if (d.cleaner) {
      try {
        const tail = await d.cleaner.flush();
        if (tail.length) d.chunks.push(new Float32Array(tail));
      } catch {
        /* the tail is a few ms — fine to lose */
      }
    }
    let text = '';
    let code = failCode;
    const secs = d.chunks.reduce((n, c) => n + c.length, 0) / 16000;
    dlog(
      `direct: stopped after ${((Date.now() - d.startedAt) / 1000).toFixed(1)} s — ${secs.toFixed(1)} s audio, ` +
        `speech heard: ${d.ep.heardSpeech}, peak ${f3(d.ep.peak)}, noise ${f3(d.ep.noise)}, bar ${f3(speechBar(d.ep.noise))}, ` +
        `cleaner ${d.cleaner ? 'on' : 'off'} (raw peak ${f3(d.rawPeak)})` +
        (transcribe ? '' : ` → ${failCode}`),
    );
    if (transcribe && d.chunks.length) {
      const samples = joinChunks(d.chunks);
      d.chunks = [];
      const t0 = Date.now();
      try {
        text = await transcribeAudio(samples, 16000);
      } catch (e: any) {
        code = 'whisper-failed';
        dlog(`direct: ${modelLabel()} error ` + String(e?.message ?? e));
      }
      dlog(`direct: ${modelLabel()} ${Date.now() - t0} ms → ${text ? text.split(' ').length + ' words' : 'nothing (' + code + ')'}`);
    }
    if (direct.current !== d || session.current !== d.sid) return; // cancelled / newer session
    direct.current = null;
    if (text) {
      h.current.onText(shapeHeard([text], hints.current), true);
      h.current.onEnd?.();
    } else {
      h.current.onError?.(code);
    }
  };

  const startDirect = async (continuous: boolean) => {
    const sid = session.current;
    const stream = createPcmLiveStream({ sampleRate: 16000 });
    const d: DirectSession = {
      sid,
      stream,
      offs: [],
      chunks: [],
      ep: newEndpoint(),
      continuous,
      startedAt: Date.now(),
      finishing: false,
      cleaner: null,
      chain: Promise.resolve(),
      rawPeak: 0,
    };
    direct.current = d;
    warmWhisper();
    d.cleaner = await openLiveCleaner();
    if (direct.current !== d) return; // stopped while the cleaner opened
    dlog(`direct: noise cleaner ${d.cleaner ? 'on' : denoiseEnabled() ? 'not available' : 'switched off'}`);
    const pause = continuous ? DIRECT_PAUSE_MS.capture : DIRECT_PAUSE_MS.ask;
    const noSpeech = continuous ? DIRECT_NO_SPEECH_MS.capture : DIRECT_NO_SPEECH_MS.ask;
    let lastLog = 0;
    let secPeak = 0;
    let secRaw = 0;

    // One (cleaned) chunk: keep it, update the pause detection, log once a second.
    const take = (chunk: Float32Array, raw: number) => {
      if (!chunk.length) return;
      d.chunks.push(chunk);
      if (d.finishing) return; // the tail after stop — kept, but no more decisions
      const now = Date.now();
      const level = rms(chunk);
      const r = feedEndpoint(d.ep, level, now, pause);
      d.ep = r.ep;
      secPeak = Math.max(secPeak, level);
      secRaw = Math.max(secRaw, raw);
      if (now - lastLog >= 1000) {
        if (!lastLog) dlog(`direct: first audio after ${now - d.startedAt} ms, chunk ${chunk.length} samples`);
        else
          dlog(
            `direct: level ${f3(secPeak)} (raw ${f3(secRaw)}) noise ${f3(d.ep.noise)} bar ${f3(speechBar(d.ep.noise))} speech ${d.ep.heardSpeech}`,
          );
        lastLog = now;
        secPeak = 0;
        secRaw = 0;
      }
      if (r.done) void finishDirect(d, true);
      else if (!d.ep.heardSpeech && now - d.startedAt > noSpeech) void finishDirect(d, false);
    };

    d.offs.push(
      stream.onData((samples) => {
        if (direct.current !== d || d.finishing) return;
        const raw = new Float32Array(samples);
        const rawLevel = rms(raw);
        d.rawPeak = Math.max(d.rawPeak, rawLevel);
        if (!d.cleaner) {
          take(raw, rawLevel);
          return;
        }
        d.chain = d.chain.then(async () => {
          const c = d.cleaner;
          if (!c) return take(raw, rawLevel);
          try {
            take(new Float32Array(await c.feed(raw)), rawLevel);
          } catch (e: any) {
            dlog('direct: noise cleaner failed, using raw audio — ' + String(e?.message ?? e));
            d.cleaner = null;
            take(raw, rawLevel);
          }
        });
      }),
    );
    d.offs.push(
      stream.onError((m) => {
        dlog('direct: mic error ' + m);
        if (direct.current === d) void finishDirect(d, d.ep.heardSpeech, 'audio-capture');
      }),
    );
    await stream.start();
    if (direct.current !== d) {
      void stream.stop().catch(() => {});
      return;
    }
    h.current.onStart?.();
    clearMaxTimer();
    maxTimer.current = setTimeout(() => {
      if (direct.current === d) void finishDirect(d, true);
    }, MAX_LISTEN_MS);
  };

  const start = useCallback(
    // `onDeviceOnly` (1.10.2, Private folder): recognise ON THE PHONE or not at all — the audio never
    // goes to Google. With Whisper installed that is Whisper; otherwise Android's on-device
    // recogniser, or 'on-device-unavailable' if the phone has none.
    async (continuous = false, onDeviceOnly = false) => {
      // ALWAYS begin from a clean recognizer. A previous capture may have failed (no-speech,
      // timeout, error, cancel) and left the single global recognizer busy/wedged — so abort it
      // and wait for it to settle to 'inactive' BEFORE starting. This is what lets voice recover
      // after repeated failed captures without an app restart. The cleanup-abort's terminal events
      // are suppressed (suppressTerm) so they can't disturb the new session's listening state.
      suppressTerm.current = true;
      try {
        teardown();
        const sid = session.current;
        for (let i = 0; i < 8; i++) {
          let st = 'inactive';
          try {
            st = await ExpoSpeechRecognitionModule.getStateAsync();
          } catch {
            break; // state unavailable — abort already issued, proceed to start
          }
          if (st === 'inactive') break;
          await new Promise((r) => setTimeout(r, 25));
        }
        const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (session.current !== sid) return; // stopped/restarted meanwhile
        if (!perm.granted) {
          handlers.onError?.('not-allowed');
          return;
        }

        const whisper = whisperReady();
        let online = true;
        if (!onDeviceOnly && !(whisper && listenMode === 'phone')) {
          try {
            online = await fetchOnline();
          } catch {
            online = true; // unknown — let Google try (Whisper still backs it up)
          }
          if (session.current !== sid) return;
        }

        hints.current = listenHints(
          store.all(),
          listWords().map((w) => w.mean),
        );
        dlog(
          `start: ${continuous ? 'capture' : 'ask'}, built-in ${modelLabel()} ${whisper ? 'ready' : whisperState().status}, ` +
            `mode ${listenMode}, online ${online}, private ${onDeviceOnly}, ${hints.current.length} familiar phrases`,
        );
        // Whisper only: private mic, "Phone only", or no signal — when it's installed.
        if (whisper && (onDeviceOnly || listenMode === 'phone' || !online)) {
          dlog('start: → built-in listener (direct)');
          lastCloudListen = 0;
          await startDirect(continuous);
          return;
        }

        // Offline-first STT (1.4.0): when OFFLINE, force on-device recognition — the only way to
        // transcribe with no network — IF the device supports it. When ONLINE, allow the OS
        // recognizer (usually cloud) for better accuracy (names especially). If offline and the
        // device has no on-device pack, start() emits a 'language-not-supported'/'service-not-
        // allowed' / 'network' error → the caller shows the honest "offline pack needed" message
        // (sttErrorMessage) instead of failing silently.
        let onDevice = false;
        if (onDeviceOnly) {
          let can = false;
          try {
            can = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
          } catch {
            can = false;
          }
          if (!can) {
            handlers.onError?.('on-device-unavailable');
            return;
          }
          onDevice = true; // never the cloud recognizer
        } else {
          // Offline speech works on this phone. Do not ask supportsOnDeviceRecognition() first:
          // in airplane mode that check often says no, and the mic was then sent to the online
          // recognizer, which failed and looked like voice had disappeared.
          onDevice = !online;
        }
        // Whisper installed → Google also records what it hears, so Whisper can take over if it fails.
        armed.current = whisper && !onDevice;
        oneShot.current = !continuous; // voice.18: finish when the words stop changing
        lastWords.current = '';
        dlog(`start: → Google${onDevice ? ' on-device' : ''}${armed.current ? ' + backup recording' : ''}`);
        lastCloudListen = onDevice ? 0 : Date.now();
        if (armed.current) warmWhisper();
        ExpoSpeechRecognitionModule.start({
          lang: 'en-US',
          interimResults: true,
          continuous,
          maxAlternatives: 5,
          contextualStrings: hints.current,
          requiresOnDeviceRecognition: onDevice,
          ...(armed.current ? { recordingOptions: { persist: true } } : null),
          // Ask and capture both wait through a mid-thought pause. Advisory to the Android
          // recognizer (may be ignored on some ROMs — see the tuning-constants note). Our own
          // 3 s timer above is the part we fully control.
          androidIntentOptions: {
            EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: SILENCE_COMPLETE_MS,
            EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: SILENCE_POSSIBLY_MS,
            EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: MIN_LISTEN_MS,
          },
        });
        // Hard ceiling for capture: stop() after MAX_LISTEN_MS so it can't listen forever. This
        // is app-level and reliable regardless of how the recognizer treats the silence extras.
        clearMaxTimer();
        const sidAsk = session.current;
        const stopNow = (why: string) => {
          if (session.current !== sidAsk) return;
          dlog(`google: ${why} → stopping`);
          try {
            ExpoSpeechRecognitionModule.stop();
          } catch {
            /* the 'end'/'error' handler clears the timer */
          }
        };
        if (continuous) {
          maxTimer.current = setTimeout(() => stopNow(`${MAX_LISTEN_MS} ms ceiling`), MAX_LISTEN_MS);
        } else {
          noWordsTimer.current = setTimeout(() => {
            noWordsTimer.current = null;
            if (!lastWords.current) stopNow(`no words in ${ASK_NO_WORDS_MS} ms`);
          }, ASK_NO_WORDS_MS);
          maxTimer.current = setTimeout(() => stopNow(`${ASK_MAX_MS} ms ceiling for a question`), ASK_MAX_MS);
        }
      } catch (err: any) {
        teardown(); // no half-started session or lingering timer left behind
        handlers.onError?.(err?.message ?? 'stt-failed');
      } finally {
        // Close the suppression window. ExpoSpeechRecognitionModule.start() is synchronous, so by
        // here the cleanup-abort's events have fired (we waited for 'inactive'); real recognition
        // events arrive AFTER this and propagate normally.
        suppressTerm.current = false;
      }
    },
    [handlers],
  );

  /** Stop listening. Returns true if a result is still on its way (Whisper is transcribing). */
  const stop = useCallback((): boolean => {
    const d = direct.current;
    if (d) {
      if (!d.finishing) void finishDirect(d, true);
      return true;
    }
    if (held.current) return true;
    clearMaxTimer();
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      /* ignore */
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Stop and throw away anything still coming (e.g. the note is being saved right now). */
  const cancel = useCallback(() => {
    teardown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { start, stop, cancel };
}

/** Whether speech recognition is usable right now, including with no signal. */
export function sttAvailable(): boolean {
  if (whisperReady()) return true;
  try {
    return (
      ExpoSpeechRecognitionModule.supportsOnDeviceRecognition() ||
      ExpoSpeechRecognitionModule.isRecognitionAvailable()
    );
  } catch {
    return false;
  }
}

/**
 * Honest message for a recognizer error code. The offline-STT gaps (no on-device pack while
 * offline) surface as language/service/network errors — say so plainly so the user knows voice
 * needs the speech pack (or network) rather than the capture failing silently (1.4.0).
 */
export function sttErrorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
      return 'Microphone permission is needed for voice — type instead, or grant it in Settings.';
    case 'language-not-supported':
    case 'service-not-allowed':
      return 'Offline voice needs the offline speech pack installed (Android Settings → on-device speech recognition). You can type instead.';
    case 'network':
      return 'The online listener needs a signal. Offline, the mic uses the listener on this phone — tap it again. You can also type.';
    case 'on-device-unavailable':
      return 'This phone can’t recognise speech offline, so private dictation is off (it would go to Google). Type it instead, or install the offline speech pack (Android Settings → on-device speech recognition).';
    case 'no-speech':
      return 'Didn’t catch that — tap the mic and try again.';
    case 'audio-capture':
      return 'The microphone stopped — tap the mic and try again.';
    case 'whisper-failed':
      return 'The built-in listener couldn’t transcribe that — try again, or type it.';
    default:
      return 'Voice input failed (' + code + '). You can type instead.';
  }
}
