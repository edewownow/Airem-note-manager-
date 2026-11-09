/**
 * The bridge to the Kotlin Gemma module (modules/memoairem-llm).
 *
 * Optional at every step: an older build has no module, a phone may be unsupported, and no model
 * file may be on the phone. In each case `llm()` / the calls below say so and the app carries on
 * exactly as before. Never logs a question, a record or an answer — only sizes and timings.
 */
import { requireOptionalNativeModule } from 'expo';

export interface LlmDeviceInfo {
  supported: boolean;
  sdk: number;
  model: string;
  abi: string;
  totalRamMb: number;
  availRamMb: number;
  lowRam: boolean;
  freeDiskMb: number;
  modelDir: string;
}

export interface LlmModelFile {
  name: string;
  path: string;
  sizeMb: number;
}

interface NativeLlm {
  llmVersion(): number;
  deviceInfo(): LlmDeviceInfo;
  findModels(): LlmModelFile[];
  status(): { loaded: boolean; backend: string | null; path: string | null };
  load(path: string, backend: 'auto' | 'gpu' | 'cpu', maxTokens: number): Promise<{ backend: string; ms: number }>;
  ask(system: string, prompt: string, schema: string | null, maxOut: number): Promise<{ text: string; ms: number }>;
  /** Build the next conversation ahead of the question. Missing on an older build. */
  prepare?(system: string, schema: string | null, maxOut: number): boolean;
  unload(): Promise<boolean>;
}

let mod: NativeLlm | null | undefined;

/** The Kotlin module, or null (an older build without it). */
export function llm(): NativeLlm | null {
  if (mod === undefined) {
    try {
      const m = requireOptionalNativeModule<NativeLlm>('MemoairemLlm');
      mod = m && typeof m.llmVersion === 'function' && m.llmVersion() >= 1 ? m : null;
    } catch {
      mod = null;
    }
  }
  return mod;
}

/** Gemma 4 E2B needs roughly this much memory free to load without the phone killing the app. */
export const MIN_TOTAL_RAM_MB = 5500;

/** A short, safe line for the log: sizes and timings only. */
export function llmLog(msg: string): void {
  console.log('[gemma] ' + msg);
}
