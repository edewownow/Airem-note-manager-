/**
 * First-run downloads. Kokoro, then Parakeet, then Gemma — never at the same time.
 * Setup does not wait, and leaving a setup screen does not cancel the one in progress.
 * No signal: wait, then start the line. A failure names what stopped and says the
 * three are optional, and that the best of the app needs them.
 */
import { getFSInfo } from '@dr.pogodin/react-native-fs';
import { fetchOnline, subscribeOnline } from './connectivity';
import { gemmaDiskOk, gemmaFileState, installGemma, refreshGemma } from './gemmaFile';
import { ensureGemmaLoaded } from './gemmaLive';
import { installKokoro, kokoroState, refreshKokoro } from './kokoro';
import { persist } from './persist';
import { installModel, modelState, refreshWhisper, setActiveModel } from './whisper';

export type SetupDownloadKind = 'idle' | 'working' | 'done' | 'failed' | 'offline';

const BEST =
  'They are optional, and MemoAirem still works. For the best of the app — a voice on this phone, a listener on this phone, and Gemma’s spoken answers — Kokoro, Parakeet, and Gemma need to download.';

/** Set when first-run setup starts the line. Only a phone that did this resumes it on launch. */
const STARTED_KEY = 'setup_downloads_started';

let kicked = false;
let running = false;
let waiting = false;
let kind: SetupDownloadKind = 'idle';
let note = '';
const listeners = new Set<() => void>();

function setNote(next: SetupDownloadKind, text: string): void {
  kind = next;
  note = text;
  for (const l of listeners) l();
}

export function setupDownloadKind(): SetupDownloadKind {
  return kind;
}

export function setupDownloadNote(): string {
  return note;
}

export function subscribeSetupDownloads(cb: () => void): () => void {
  listeners.add(cb);
  cb();
  return () => listeners.delete(cb);
}

/** Start the line once. Safe to call again. */
export function startSetupDownloads(): void {
  if (kicked) return;
  kicked = true;
  persist.set(STARTED_KEY, '1');
  void run();
}

/**
 * On launch: finish or retry the line only if first-run setup already started it. A phone
 * that was set up before this existed (build 143 and older) is left alone — nothing starts
 * a 3 GB download on it without being asked.
 */
export function resumeSetupDownloads(): void {
  if (kicked || persist.getString(STARTED_KEY) !== '1') return;
  kicked = true;
  void run();
}

/** Try the ones that are not on the phone yet. Ignored while a download is already going. */
export function retrySetupDownloads(): void {
  if (running || waiting) return;
  void run();
}

async function run(): Promise<void> {
  if (running || waiting) return;
  if (!(await fetchOnline())) {
    waiting = true;
    setNote(
      'offline',
      `No signal, so the downloads are waiting. ${BEST} They will start, one at a time, when this phone has a signal. You can keep setting up.`,
    );
    const unsub = subscribeOnline((online) => {
      if (!online) return;
      unsub();
      waiting = false;
      void queue();
    });
    return;
  }
  await queue();
}

async function freeMb(): Promise<number> {
  try {
    return (await getFSInfo()).freeSpace / 1048576;
  } catch {
    return 0;
  }
}

function missing(): string[] {
  const out: string[] = [];
  if (kokoroState().status !== 'ready') out.push('Kokoro, the voice');
  if (modelState('parakeet').status !== 'ready') out.push('Parakeet, the listener');
  if (gemmaFileState().status !== 'ready') out.push('Gemma');
  return out;
}

function finish(): void {
  const miss = missing();
  if (miss.length === 0) {
    setNote('done', 'Kokoro, Parakeet, and Gemma are on this phone.');
    return;
  }
  const tight = gemmaFileState().error?.includes('3 GB') ?? false;
  const which =
    miss.length === 3
      ? 'Kokoro, Parakeet, and Gemma didn’t finish.'
      : `${miss.join(' and ')} didn’t finish.`;
  const room = tight ? ' Gemma needs about 3 GB free.' : '';
  setNote('failed', `${which}${room} ${BEST} Try again, or do it later in Settings.`);
}

async function queue(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await refreshKokoro();
    await refreshWhisper();
    await refreshGemma();

    if (kokoroState().status !== 'ready') {
      setNote('working', '1 of 3. Downloading Kokoro, the voice. Parakeet is next, then Gemma. One at a time. You can keep setting up.');
      await installKokoro();
    }
    if (modelState('parakeet').status !== 'ready') {
      setNote('working', '2 of 3. Downloading Parakeet, the listener. Gemma is next. One at a time.');
      await installModel('parakeet');
      if (modelState('parakeet').status === 'ready' && modelState('whisper').status !== 'ready') {
        setActiveModel('parakeet');
      }
    }
    if (gemmaFileState().status !== 'ready') {
      const room = await freeMb();
      if (!gemmaDiskOk(room)) {
        await installGemma(room);
      } else {
        setNote('working', '3 of 3. Downloading Gemma. This one is large. One at a time.');
        await installGemma(room);
        if (gemmaFileState().status === 'ready') void ensureGemmaLoaded();
      }
    }
    finish();
  } finally {
    running = false;
  }
}
