/**
 * Gemma on this phone. The model is not inside the app (it is 2.6 GB, larger than a Play
 * download piece). The phone downloads it once, the same way it downloads the voice.
 * After that it stays in the app's models folder and needs no signal to speak.
 */
import { DocumentDirectoryPath, downloadFile, exists, mkdir, moveFile, stat, stopDownload, unlink } from '@dr.pogodin/react-native-fs';

export const GEMMA_FILE = 'gemma-4-E2B-it.litertlm';
/** Google's published LiteRT file (litert-community). Size checked against the file used on this project. */
export const GEMMA_URL =
  'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm?download=true';
export const GEMMA_BYTES = 2_588_147_712;

const DIR = `${DocumentDirectoryPath}/models`;
const FINAL = `${DIR}/${GEMMA_FILE}`;
const PART = `${FINAL}.part`;

export type GemmaFileStatus = 'unknown' | 'missing' | 'downloading' | 'ready' | 'error';

export interface GemmaFileState {
  status: GemmaFileStatus;
  fraction: number;
  error: string | null;
}

let state: GemmaFileState = { status: 'unknown', fraction: 0, error: null };
const listeners = new Set<(s: GemmaFileState) => void>();
let jobId: number | null = null;

function setState(patch: Partial<GemmaFileState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l(state);
}

export function gemmaFileState(): GemmaFileState {
  return state;
}

export function subscribeGemmaFile(cb: (s: GemmaFileState) => void): () => void {
  listeners.add(cb);
  cb(state);
  return () => listeners.delete(cb);
}

/** Enough room for the file plus a little spare. */
export function gemmaDiskOk(freeDiskMb: number): boolean {
  return freeDiskMb * 1048576 > GEMMA_BYTES + 400 * 1048576;
}

/** See if the model is already on the phone. Does not download. */
export async function refreshGemma(): Promise<void> {
  if (state.status === 'downloading') return;
  try {
    if (await exists(FINAL)) {
      const size = (await stat(FINAL)).size;
      if (size >= GEMMA_BYTES * 0.98) {
        setState({ status: 'ready', fraction: 1, error: null });
        return;
      }
    }
    setState({ status: 'missing', fraction: 0, error: null });
  } catch {
    setState({ status: 'missing', fraction: 0, error: null });
  }
}

/** Download the model into the folder Gemma already searches. Progress is on subscribeGemmaFile. */
export async function installGemma(freeDiskMb: number): Promise<void> {
  if (state.status === 'downloading') return;
  try {
    if (await exists(FINAL)) {
      const size = (await stat(FINAL)).size;
      if (size >= GEMMA_BYTES * 0.98) {
        setState({ status: 'ready', fraction: 1, error: null });
        return;
      }
    }
  } catch {
    /* a missing file falls through to the download */
  }
  if (!gemmaDiskOk(freeDiskMb)) {
    setState({ status: 'error', fraction: 0, error: 'This phone needs about 3 GB free to keep Gemma.' });
    return;
  }
  setState({ status: 'downloading', fraction: 0, error: null });
  try {
    await mkdir(DIR);
    if (await exists(FINAL)) {
      const size = (await stat(FINAL)).size;
      if (size >= GEMMA_BYTES * 0.98) {
        setState({ status: 'ready', fraction: 1, error: null });
        return;
      }
      await unlink(FINAL);
    }
    await unlink(PART).catch(() => {});
    const job = downloadFile({
      fromUrl: GEMMA_URL,
      toFile: PART,
      progressInterval: 500,
      connectionTimeout: 30_000,
      readTimeout: 120_000,
      progress: (r) => {
        const total = r.contentLength > 0 ? r.contentLength : GEMMA_BYTES;
        setState({ fraction: Math.min(1, r.bytesWritten / total) });
      },
    });
    jobId = job.jobId;
    const res = await job.promise;
    jobId = null;
    if (gemmaFileState().status !== 'downloading') return;
    const size = (await stat(PART)).size;
    if (res.statusCode < 200 || res.statusCode >= 300 || size < GEMMA_BYTES * 0.98) {
      await unlink(PART).catch(() => {});
      throw new Error(`download stopped (HTTP ${res.statusCode}, ${Math.round(size / 1048576)} MB)`);
    }
    await moveFile(PART, FINAL);
    setState({ status: 'ready', fraction: 1, error: null });
  } catch (e: unknown) {
    jobId = null;
    if (gemmaFileState().status === 'missing') return;
    await unlink(PART).catch(() => {});
    setState({ status: 'error', fraction: 0, error: e instanceof Error ? e.message : String(e) });
  }
}

export function cancelGemmaInstall(): void {
  if (jobId != null) stopDownload(jobId);
  jobId = null;
  setState({ status: 'missing', fraction: 0, error: null });
  void unlink(PART).catch(() => {});
}
