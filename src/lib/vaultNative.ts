/**
 * 2.0.0-autofill.2 (autofill plan phase 1b) — the Kotlin vault core (modules/memoairem-vault).
 *
 * Today it does ONE job: scrypt, the slow part of the PIN / secret-question check, in Kotlin.
 * SAFETY: at every start it is checked against the JS code on fresh random input; only an exact
 * match switches it on. No module (an older build), an error, or any difference → the JS code
 * stays, exactly as before. Either way the same PIN gives the same key, so nothing about the
 * folder changes — it only gets faster.
 */
import { requireOptionalNativeModule } from 'expo';
import { getRandomBytes } from 'expo-crypto';
import { bytesToHex, hexToBytes, jsScrypt, useScrypt, type ScryptFn } from './vaultCrypto';

export interface NativeVault {
  coreVersion(): number;
  scryptHex(passwordHex: string, saltHex: string, n: number, r: number, p: number, dkLen: number): Promise<string>;
  // v2 (2.0.0-autofill.3): phone-bound keys
  secretPut?(name: 'pepper', value: string): Promise<void>;
  secretGet?(name: 'pepper'): Promise<string | null>;
  secretDelete?(name: 'pepper'): Promise<void>;
  bioAvailable?(): boolean;
  bioSaved?(): boolean;
  bioSave?(value: string, title: string): Promise<boolean>;
  bioOpen?(title: string): Promise<string>;
  bioDelete?(): Promise<void>;
  // v3 (2.0.0-autofill.4): the folder's storage — synchronous
  storeExists?(id: string): boolean;
  storeOpen?(id: string, k: string): boolean;
  storeGet?(name: string): string | null;
  storeSet?(name: string, value: string): void;
  storeRemove?(name: string): void;
  storeKeys?(): string[];
  storeClose?(): void;
  storeDelete?(id: string): boolean;
  // v4 (2.0.0-autofill.6): autofill
  autofillSync?(id: string | null): void;
  autofillStatus?(): { supported: boolean; enabled: boolean; folder: boolean; fingerprint: boolean; pin?: boolean; index?: boolean };
  autofillOpenSettings?(): boolean;
  // v5 (2.0.0-autofill.8, phase 3): the PIN inside autofill + ONE wrong-PIN count for app and autofill
  autofillPinSync?(json: string | null): void;
  failsGet?(): { n: number; until: number };
  failsSet?(n: number, until: number): void;
  // v6 (2.0.0-autofill.9): the coded list of places with a saved login (null = forget it)
  autofillIndexSync?(sites: string[] | null): void;
}

let engine: 'js' | 'kotlin' = 'js';
let checked: Promise<void> | null = null;
let proven: NativeVault | null = null; // passed the self-check this start

const nativeScrypt =
  (m: NativeVault): ScryptFn =>
  async (password, salt, o) => {
    try {
      return hexToBytes(await m.scryptHex(bytesToHex(password), bytesToHex(salt), o.N, o.r, o.p, o.dkLen));
    } catch (e) {
      console.log('[private] Kotlin core failed — back to JS:', String((e as any)?.message ?? e));
      engine = 'js';
      useScrypt(jsScrypt);
      return jsScrypt(password, salt, o);
    }
  };

/** Run once at start (and awaited before any PIN check). Never throws. */
export function checkVaultCore(mod: NativeVault | null = requireOptionalNativeModule<NativeVault>('MemoairemVault')): Promise<void> {
  if (checked) return checked;
  checked = (async () => {
    if (!mod) {
      console.log('[private] vault core: JS (no Kotlin module in this build)');
      return;
    }
    try {
      const pw = getRandomBytes(12);
      const salt = getRandomBytes(16);
      const o = { N: 1024, r: 8, p: 1, dkLen: 32 };
      const [k, j] = await Promise.all([mod.scryptHex(bytesToHex(pw), bytesToHex(salt), o.N, o.r, o.p, o.dkLen), jsScrypt(pw, salt, o)]);
      if (k === bytesToHex(j)) {
        engine = 'kotlin';
        proven = mod;
        useScrypt(nativeScrypt(mod));
        console.log(`[private] vault core: Kotlin v${mod.coreVersion()} (self-check matched JS)`);
      } else {
        console.log('[private] vault core: JS — Kotlin self-check DIFFERED, not used');
      }
    } catch (e) {
      console.log('[private] vault core: JS — Kotlin self-check failed:', String((e as any)?.message ?? e));
    }
  })();
  return checked;
}

export function vaultEngine(): 'js' | 'kotlin' {
  return engine;
}

/** 2.0.0-autofill.4: the Kotlin core for STORAGE — a v3+ module that passed this start's self-check. */
export async function storeCore(): Promise<NativeVault | null> {
  await checkVaultCore();
  try {
    return proven && proven.coreVersion() >= 3 && proven.storeOpen && proven.storeGet ? proven : null;
  } catch {
    return null;
  }
}

/**
 * 2.0.0-autofill.3: the Kotlin core for KEYS — only a v2+ module that passed this start's
 * self-check (so it is the real module, answering correctly). Else null → expo-secure-store.
 */
export async function keyCore(): Promise<NativeVault | null> {
  await checkVaultCore();
  try {
    return proven && proven.coreVersion() >= 2 && proven.secretGet && proven.bioOpen ? proven : null;
  } catch {
    return null;
  }
}

/**
 * 2.0.0-autofill.8: the proven core, synchronously — v5+ only (the shared wrong-PIN count, the
 * PIN's locked copy for autofill). Null before this start's self-check has finished, or on older cores.
 */
export function coreNow(): NativeVault | null {
  try {
    return proven && proven.coreVersion() >= 5 && proven.failsGet && proven.failsSet ? proven : null;
  } catch {
    return null;
  }
}

/** 2.0.0-autofill.9: the proven core when it keeps the coded site list (v6+), synchronously. */
export function indexCore(): NativeVault | null {
  try {
    return proven && proven.coreVersion() >= 6 && proven.autofillIndexSync ? proven : null;
  } catch {
    return null;
  }
}

/** Tests only: forget the last check. */
export function resetVaultCoreForTests(): void {
  checked = null;
  proven = null;
  engine = 'js';
  useScrypt(jsScrypt);
}
