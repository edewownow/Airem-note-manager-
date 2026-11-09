/**
 * Copy a password for pasting into another app, then WIPE the clipboard (1.10.5).
 *
 *   - `copySecret(pw)` puts it on the clipboard and schedules a clear after CLEAR_MS (30 s).
 *   - The clear only wipes the clipboard if it still holds OUR password (compared by SHA-256 —
 *     the password itself isn't kept in memory after copying). If something else was copied since,
 *     it's left alone.
 *   - The timer lives here (module level), NOT in the Private folder screen, because the screen
 *     locks and closes as soon as you switch to the other app to paste. If Android paused the timer
 *     while MemoAirem was in the background, the clear runs the moment MemoAirem is opened again.
 *   - Android 10+ doesn't let a background app READ the clipboard; if the check can't read it, the
 *     clipboard is cleared anyway (better to wipe than to leave a password there).
 *
 * Limit: expo-clipboard can't mark the copy as SENSITIVE, so on Android 13+ the system's copy
 * preview may show it briefly, and a keyboard with clipboard history (Gboard) may keep its own copy
 * until it expires there. The in-app warning says so.
 */
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import { AppState } from 'react-native';

export const CLEAR_MS = 30_000;

let pending: { digest: string; due: number } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

function sha(s: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s);
}

async function clearNow(): Promise<void> {
  const p = pending;
  if (!p) return;
  pending = null;
  if (timer) clearTimeout(timer);
  timer = null;
  let current: string | null = null;
  try {
    current = await Clipboard.getStringAsync();
  } catch {
    current = null; // can't read (background on Android 10+) → wipe anyway
  }
  if (current == null || current === '' || (await sha(current)) === p.digest) {
    await Clipboard.setStringAsync('').catch(() => {});
  }
}

function listenOnce(): void {
  if (listening) return;
  listening = true;
  AppState.addEventListener('change', (s) => {
    if (s === 'active' && pending && Date.now() >= pending.due) void clearNow();
  });
}

/** Copy `secret` and wipe it from the clipboard after CLEAR_MS. */
export async function copySecret(secret: string): Promise<boolean> {
  if (!secret) return false;
  listenOnce();
  try {
    await Clipboard.setStringAsync(secret);
  } catch {
    return false;
  }
  pending = { digest: await sha(secret), due: Date.now() + CLEAR_MS };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void clearNow(), CLEAR_MS);
  return true;
}
