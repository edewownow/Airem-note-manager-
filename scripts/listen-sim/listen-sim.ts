/**
 * Listening simulation (1.12.0-voice.3) — run after ANY change to useSpeechToText (src/lib/speech.ts)
 * or src/lib/whisper.ts:
 *
 *   npx esbuild scripts/listen-sim/listen-sim.ts --bundle --platform=node --outfile=scripts/listen-sim/.out.js \
 *     --alias:react=./scripts/listen-sim/mocks/react.ts --alias:expo-speech-recognition=./scripts/listen-sim/mocks/speechrec.ts \
 *     --alias:expo-speech=./scripts/listen-sim/mocks/expospeech.ts --alias:@dr.pogodin/react-native-fs=./scripts/listen-sim/mocks/rnfs.ts \
 *     --alias:@react-native-community/netinfo=./scripts/listen-sim/mocks/netinfo.ts \
 *     --alias:react-native-sherpa-onnx=./scripts/listen-sim/mocks/sherpa --alias:react-native-mmkv=./scripts/vault-sim/mocks/mmkv.ts \
 *     && node scripts/listen-sim/.out.js
 *
 * The Google mock replays expo-speech-recognition's real Android order on a failure:
 * error → audioend {uri} → end (teardownAndEnd → stopRecording → end).
 */
import { emit, rec } from './mocks/speechrec';
import { audio } from './mocks/sherpa/audio';
import { stt } from './mocks/sherpa/stt';
import { fs } from './mocks/rnfs';
import { net } from './mocks/netinfo';
import { enh } from './mocks/sherpa/enhancement';
import * as D from '../../src/lib/denoise';
import { useSpeechToText, setListenMode, sttErrorMessage } from '../../src/lib/speech';
import * as W from '../../src/lib/whisper';

let clock = 1_000_000;
Date.now = () => clock;
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const ok = (c: any, m: string) => {
  console.log(c ? '✓' : '✗', m);
  if (!c) process.exitCode = 1;
};

const log: string[] = [];
const hook = useSpeechToText({
  onText: (t, f) => log.push(`text:${t}:${f}`),
  onEnd: () => log.push('end'),
  onError: (c) => log.push(`err:${c}`),
  onStart: () => log.push('start'),
});
const reset = () => {
  log.length = 0;
  rec.starts.length = 0;
  fs.unlinked.length = 0;
  stt.pieces.length = 0;
  stt.texts.length = 0;
  audio.decodeCalls = 0;
};

const tone = (amp: number, n = 1600) => {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = amp * Math.sin(i / 3);
  return a;
};
const SPEECH = Array.from(tone(0.2, 16000 * 2)); // 2 s of "speech"
const SILENCE = Array.from(tone(0.003, 16000 * 2));
const speechWav = [...SILENCE.slice(0, 8000), ...SPEECH, ...SILENCE.slice(0, 8000)];

/** Feed the direct stream: 100 ms chunks, advancing the clock. */
async function feed(amp: number, ms: number) {
  for (let t = 0; t < ms; t += 100) {
    clock += 100;
    audio.stream.push(tone(amp));
    await tick(3); // like the real mic: the next chunk comes after this one was processed
  }
  await tick();
}

(async () => {
  await W.refreshWhisper();
  ok(W.whisperReady(), 'whisper installed (mock files present)');

  // 1 — online, Google succeeds: Whisper never runs, backup recording deleted
  reset();
  await hook.start(false);
  ok(rec.starts.length === 1 && rec.starts[0].recordingOptions?.persist === true, 'online + Whisper installed → Google starts AND records a backup');
  emit('start');
  emit('result', { results: [{ transcript: 'what is on friday' }], isFinal: true });
  emit('audioend', { uri: 'file:///cache/rec1.wav' });
  emit('end');
  await tick();
  ok(log.join('|') === 'start|text:what is on friday:true|end', 'Google result delivered, ends once');
  ok(fs.unlinked.includes('/cache/rec1.wav') && stt.pieces.length === 0, 'backup recording deleted, Whisper not used');

  // 2 — Google network error with speech in the recording → Whisper rescues it
  reset();
  audio.decoded['/cache/rec2.wav'] = speechWav;
  stt.texts.push('remind me to buy bread');
  await hook.start(false);
  emit('start');
  emit('error', { error: 'network' });
  emit('audioend', { uri: 'file:///cache/rec2.wav' });
  emit('end');
  ok(!log.some((l) => l.startsWith('err') || l === 'end'), 'error + end held while Whisper works');
  await tick(60);
  ok(log.join('|') === 'start|text:remind me to buy bread:true|end', 'Whisper text delivered as final, then one end — no error shown');
  ok(fs.unlinked.includes('/cache/rec2.wav'), 'rescued recording deleted');

  // 2b — order variant: audioend before error
  reset();
  audio.decoded['/cache/rec2b.wav'] = speechWav;
  stt.texts.push('dinner with sam');
  await hook.start(false);
  emit('audioend', { uri: 'file:///cache/rec2b.wav' });
  emit('error', { error: 'busy' });
  emit('end');
  await tick(60);
  ok(log.join('|') === 'text:dinner with sam:true|end', 'recording handed over before the error → still rescued');

  // 2c — rescue finishes before Google's 'end' arrives → that late end is ignored
  reset();
  audio.decoded['/cache/rec2c.wav'] = speechWav;
  await hook.start(false);
  emit('error', { error: 'network' });
  emit('audioend', { uri: 'file:///cache/rec2c.wav' });
  await tick(60);
  emit('end');
  ok(log.join('|') === 'text:whisper text:true|end', 'late Google end after a rescue does not end twice');

  // 3 — Google no-speech, recording is silent → original error, Whisper never runs on silence
  reset();
  audio.decoded['/cache/rec3.wav'] = SILENCE;
  await hook.start(false);
  emit('error', { error: 'no-speech' });
  emit('audioend', { uri: 'file:///cache/rec3.wav' });
  emit('end');
  await tick(60);
  ok(log.join('|') === 'err:no-speech' && stt.pieces.length === 0, 'silent recording → "no-speech", Whisper not run (no hallucination)');

  // 4 — error but Google never hands over a recording → error after the wait
  reset();
  await hook.start(false);
  emit('error', { error: 'network' });
  emit('end');
  await tick(100);
  ok(log.length === 0, 'waiting for the recording');
  await tick(3000);
  ok(log.join('|') === 'err:network', 'no recording → original error after 3 s');

  // 5 — errors Whisper must not cover
  reset();
  await hook.start(false);
  emit('error', { error: 'audio-capture' });
  emit('audioend', { uri: 'file:///cache/rec5.wav' });
  emit('end');
  await tick(30);
  ok(log[0] === 'err:audio-capture' && audio.decodeCalls === 0, 'mic error → shown at once, not rescued');

  // 6 — offline → direct Whisper recording, Google never started
  reset();
  net.online = false;
  await hook.start(false);
  ok(rec.starts.length === 0 && audio.stream?.started, 'offline → records directly, Google not started');
  stt.texts.push('what is my schedule tomorrow');
  await feed(0.003, 300); // room noise
  await feed(0.2, 1500); // speech
  ok(!log.some((l) => l.startsWith('text')), 'still listening during speech');
  await feed(0.003, 1700); // a breath — this used to end the instruction
  ok(!log.some((l) => l.startsWith('text')), 'a 1.7 s pause does not cut the instruction');
  await feed(0.003, 1500); // total silence 3.2 s
  await tick(30);
  ok(log.join('|') === 'start|text:what is my schedule tomorrow:true|end', 'stops itself after a 3 s pause → text + end');
  ok(audio.stream.stopped, 'mic released');
  net.online = true;

  // 6b — voice.4: quiet raw mic (no gain) — used to never count as speech
  reset();
  net.online = false;
  await hook.start(false);
  await feed(0.002, 300);
  await feed(0.015, 1500);
  await feed(0.002, 3200);
  await tick(30);
  ok(log.join('|') === 'start|text:whisper text:true|end', 'quiet mic (level ~0.01) still heard → text');

  // 6c — voice.4: talking straight away (no quiet start) — used to learn the voice as "noise"
  reset();
  await hook.start(false);
  await feed(0.2, 1500);
  await feed(0.003, 3200);
  await tick(30);
  ok(log.join('|') === 'start|text:whisper text:true|end', 'talking the instant the mic opens → text');

  // 6d — a single click / bump is not speech
  reset();
  await hook.start(false);
  await feed(0.003, 300);
  clock += 40;
  audio.stream.push(tone(0.3, 640));
  await feed(0.003, 7200);
  await tick(30);
  ok(log.join('|') === 'start|err:no-speech' && stt.pieces.length === 0, 'one click → still "no-speech", Whisper not run');
  net.online = true;

  // 6e — voice.6 noise cleaner: on by default once present; every sample reaches Whisper, in order
  reset();
  ok(await D.ensureDenoiser(), 'noise cleaner present (mock file, right size)');
  ok(D.denoiseActive(), 'noise cleaner on by default');
  net.online = false;
  enh.fed = 0; enh.out = 0;
  await hook.start(false);
  await feed(0.04, 300); // fan noise
  await feed(0.2, 1500);
  await feed(0.04, 3200);
  await tick(60);
  const fedTotal = enh.fed;
  ok(log.join('|') === 'start|text:whisper text:true|end', 'noisy room + cleaner → text after the pause');
  ok(enh.out === fedTotal && stt.pieces.reduce((a, b) => a + b, 0) === fedTotal, `nothing lost: ${fedTotal} samples in = cleaned out (incl. tail) = sent to Whisper`);

  // 6f — cleaner fails mid-session → raw audio, still works
  reset();
  await hook.start(false);
  await feed(0.003, 300);
  enh.fail = true;
  await feed(0.2, 1500);
  await feed(0.003, 3200);
  await tick(60);
  enh.fail = false;
  ok(log.join('|') === 'start|text:whisper text:true|end', 'cleaner failure → falls back to raw audio, still transcribed');

  // 6g — switched off → raw audio, cleaner not used
  reset();
  D.setDenoiseEnabled(false);
  enh.fed = 0;
  await hook.start(false);
  await feed(0.003, 300);
  await feed(0.2, 1500);
  await feed(0.003, 3200);
  await tick(60);
  ok(log.join('|') === 'start|text:whisper text:true|end' && enh.fed === 0, 'cleaner switched off → raw audio');
  D.setDenoiseEnabled(true);
  net.online = true;

  // 6h — Google rescue: the saved recording is cleaned before Whisper
  reset();
  enh.offlineCalls = 0;
  audio.decoded['/cache/rec6h.wav'] = speechWav;
  await hook.start(false);
  emit('error', { error: 'network' });
  emit('audioend', { uri: 'file:///cache/rec6h.wav' });
  emit('end');
  await tick(60);
  ok(enh.offlineCalls === 1 && log.join('|') === 'text:whisper text:true|end', 'rescue: recording cleaned, then transcribed');

  // 6i — voice.18: a distant voice after you've spoken counts as silence (cleaner off: it can't remove speech anyway)
  reset();
  D.setDenoiseEnabled(false);
  net.online = false;
  await hook.start(false);
  await feed(0.003, 300);
  await feed(0.3, 1500); // you, at the phone
  await feed(0.09, 3200); // someone across the room (~ -10 dB) — loud enough to beat the room bar
  await tick(40);
  ok(log.join('|') === 'start|text:whisper text:true|end', 'distant voice after you stop → ends after 3 s anyway');
  // …but a quiet voice from the START is still you (nothing to compare with yet)
  reset();
  await hook.start(false);
  await feed(0.002, 300);
  await feed(0.02, 1500);
  await feed(0.002, 3200);
  await tick(40);
  ok(log.join('|') === 'start|text:whisper text:true|end', 'your own soft voice is still heard');
  D.setDenoiseEnabled(true);
  net.online = true;

  // 6j — voice.18: Google one-shot finishes when its words stop changing (a hum makes no words)
  reset();
  rec.stops = 0;
  await hook.start(false);
  emit('start');
  emit('result', { results: [{ transcript: 'what is on' }], isFinal: false });
  await tick(500);
  emit('result', { results: [{ transcript: 'what is on tomorrow' }], isFinal: false });
  await tick(1000);
  ok(rec.stops === 0, 'still changing → keeps listening');
  emit('result', { results: [{ transcript: 'what is on tomorrow' }], isFinal: false }); // same words (hum)
  await tick(1200);
  ok(rec.stops === 0, 'a short gap does not cut the instruction');
  await tick(1000);
  ok(rec.stops === 1, 'words unchanged for 3 s → finished by MemoAirem');
  emit('result', { results: [{ transcript: 'what is on tomorrow' }], isFinal: true });
  emit('end');
  await tick(20);
  ok(log.filter((l) => l.startsWith('text:what is on tomorrow:true')).length === 1 && log[log.length - 1] === 'end', 'final words delivered once, then end');
  // capture (continuous) is never cut this way
  reset();
  rec.stops = 0;
  await hook.start(true);
  emit('result', { results: [{ transcript: 'note the wine list' }], isFinal: false });
  await tick(1700);
  ok(rec.stops === 0, 'continuous capture: not finished early');
  hook.cancel();

  // 7 — capture (continuous) waits 3 s, not 1.5 s
  reset();
  setListenMode('phone');
  await hook.start(true);
  ok(rec.starts.length === 0, '"Phone only" online → direct, Google not started');
  await feed(0.003, 300);
  await feed(0.2, 1000);
  await feed(0.003, 2000);
  ok(!log.some((l) => l.startsWith('text')), 'capture: a 2 s thinking pause does not cut you off');
  await feed(0.2, 1000);
  await feed(0.003, 3200);
  await tick(30);
  ok(log.filter((l) => l.startsWith('text')).length === 1 && log[log.length - 1] === 'end', 'capture: ends after a 3 s pause, one result');

  // 8 — tapping the mic to stop → result still arrives
  reset();
  await hook.start(true);
  await feed(0.003, 300);
  await feed(0.2, 1200);
  const coming = hook.stop();
  ok(coming === true, 'stop() reports a result is coming');
  await tick(40);
  ok(log.join('|') === 'start|text:whisper text:true|end', 'words delivered after the tap');

  // 9 — cancel → nothing delivered
  reset();
  await hook.start(true);
  await feed(0.003, 300);
  await feed(0.2, 1200);
  hook.cancel();
  await tick(40);
  ok(log.join('|') === 'start', 'cancel() throws the recording away');

  // 10 — nothing said → no-speech after 7 s (ask) and Whisper not run
  reset();
  await hook.start(false);
  await feed(0.003, 7300);
  await tick(30);
  ok(log.join('|') === 'start|err:no-speech' && stt.pieces.length === 0, 'silence → "no-speech" after 7 s, Whisper not run');

  // 11 — a new session while the old one is still transcribing → old text dropped
  reset();
  stt.delay = 80;
  stt.texts.push('OLD', 'NEW');
  await hook.start(false);
  await feed(0.003, 300);
  await feed(0.2, 800);
  hook.stop();
  await hook.start(false);
  await feed(0.003, 300);
  await feed(0.2, 800);
  hook.stop();
  await tick(300);
  ok(!log.some((l) => l.includes('OLD')) && log.some((l) => l.includes('NEW')), 'stale result from an older session is dropped');
  stt.delay = 5;

  // 12 — private (onDeviceOnly) mic uses Whisper even in "Google first"
  reset();
  setListenMode('google');
  await hook.start(false, true);
  ok(rec.starts.length === 0 && audio.stream.started, 'private mic → Whisper, never Google');
  hook.cancel();

  // 13 — Whisper not installed → old behaviour exactly
  reset();
  fs.present = false;
  await W.refreshWhisper();
  await hook.start(false);
  ok(rec.starts.length === 1 && !rec.starts[0].recordingOptions, 'not installed → Google without a backup recording');
  emit('error', { error: 'network' });
  emit('end');
  await tick(30);
  ok(log.join('|') === 'err:network|end', 'not installed → error shown at once (old behaviour)');
  fs.present = true;
  await W.refreshWhisper();

  // 14 — long audio is split between words, under 30 s each
  reset();
  const long: number[] = [];
  for (let s = 0; s < 45; s++) long.push(...Array.from(tone(s === 24 ? 0.004 : 0.2, 16000)));
  stt.texts.push('part one', 'part two');
  const text = await W.transcribeAudio(long, 16000);
  ok(stt.pieces.length === 2 && stt.pieces.every((p) => p <= 28 * 16000), `45 s → 2 pieces under 28 s (${stt.pieces.map((p) => (p / 16000).toFixed(1)).join(' + ')} s)`);
  ok(Math.abs(stt.pieces[0] / 16000 - 24.5) < 0.6, 'cut lands in the quiet second');
  ok(text === 'part one part two', 'pieces joined');

  // 15 — phantom lines
  ok(W.cleanTranscript('(wind blowing)') === '' && W.cleanTranscript(' [Music] ') === '' && W.cleanTranscript('*coughs*') === '' &&
    W.cleanTranscript('(wind blowing) what is on friday') === 'what is on friday' && W.cleanTranscript('remind me (wind blowing) to call Sam') === 'remind me to call Sam',
    'sound labels like "(wind blowing)" removed; words kept');
  ok(W.cleanTranscript(' Thank you. ') === '' && W.cleanTranscript('[BLANK_AUDIO]') === '' && W.cleanTranscript('thank you Sam for dinner') === 'thank you Sam for dinner', 'Whisper phantom lines dropped, real ones kept');

  // 15b — voice.7: two models; switching, removing, falling back
  await W.refreshWhisper();
  ok(W.modelState('whisper').status === 'ready' && W.modelState('parakeet').status === 'ready', 'both models found on disk');
  ok(W.activeModel() === 'whisper', 'default active model: Whisper');
  stt.created.length = 0;
  W.setActiveModel('parakeet');
  await W.transcribeAudio(speechWav, 16000);
  const made = stt.created[stt.created.length - 1];
  ok(made?.modelType === 'nemo_transducer' && made?.modelPath?.path.endsWith('sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8'), 'Parakeet active → nemo_transducer engine from its own folder');
  ok(W.modelLabel() === 'Parakeet' && W.whisperReady(), 'whisperReady() follows the active model');
  const pt = await W.selfTestModel('parakeet');
  ok(pt?.expected.startsWith("Well, I don't wish") === true, 'Parakeet self-test uses its verified transcript');
  // remove the active model → the other one takes over
  fs.missing.push('parakeet');
  await W.removeModel('parakeet');
  ok(W.activeModel() === 'whisper' && W.whisperReady(), 'removing the active model → the other one listens');
  // chosen model gone from disk at startup → the installed one is used
  W.setActiveModel('parakeet');
  await W.refreshWhisper();
  ok(W.activeModel() === 'whisper', 'chosen model missing on disk → the installed one is used');
  fs.missing.length = 0;
  await W.refreshWhisper();

  // 16 — self-test
  const t = await W.selfTestWhisper();
  ok(!!t?.ok && W.whisperState().status === 'ready', `self-test passes ("${t?.heard}")`);

  ok(sttErrorMessage('whisper-failed').length > 0 && sttErrorMessage('audio-capture').includes('microphone'), 'new error messages');
  process.exit(process.exitCode ?? 0);
})();
