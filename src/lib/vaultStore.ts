/**
 * 2.0.0-autofill.4 (autofill plan phase 1d) — WHERE the private folder's entries are stored.
 *
 * The folder code (lib/vault.ts) talks to ONE small interface, `Db`. Behind it:
 *   - MMKV (1.10 – 2.0.0-autofill.3): the encrypted MMKV file, as before;
 *   - the Kotlin core's store (modules/memoairem-vault, VaultStore.kt): one AES-256-GCM file per entry,
 *     readable by Kotlin itself — what the autofill service needs;
 *   - both at once ("dual") while a folder is moving: read from Kotlin, write to both, so the old
 *     copy stays complete and current until the Kotlin store has proven itself on a later start.
 *
 * copyAll() moves every entry and READS EACH ONE BACK; only a complete, exact copy counts.
 */
import type { NativeVault } from './vaultNative';

export interface Db {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): void;
  trim(): void;
  getAllKeys(): string[];
}

/** The Kotlin store (already opened with the folder key). A wrong key or damage THROWS — never "empty". */
export function kotlinDb(core: NativeVault): Db {
  return {
    getString: (k) => core.storeGet!(k) ?? undefined,
    set: (k, v) => core.storeSet!(k, v),
    remove: (k) => core.storeRemove!(k),
    trim: () => {},
    getAllKeys: () => core.storeKeys!(),
  };
}

/** Moving: read from `main` (Kotlin), write to both. A failing write to the old copy only logs. */
export function dualDb(main: Db, old: Db): Db {
  const both = (what: string, f: () => void) => {
    try {
      f();
    } catch (e) {
      console.log(`[private] storage: old copy not updated (${what}):`, String((e as any)?.message ?? e));
    }
  };
  return {
    getString: (k) => main.getString(k),
    set: (k, v) => {
      main.set(k, v);
      both('set', () => old.set(k, v));
    },
    remove: (k) => {
      main.remove(k);
      both('remove', () => old.remove(k));
    },
    trim: () => both('trim', () => old.trim()),
    getAllKeys: () => main.getAllKeys(),
  };
}

/** Copy every entry, then read each back. ok only when ALL are there and exact. Never throws. */
export function copyAll(from: Db, to: Db): { ok: boolean; count: number; why?: string } {
  try {
    const keys = from.getAllKeys();
    const values = new Map<string, string>();
    for (const k of keys) {
      const v = from.getString(k);
      if (typeof v === 'string') values.set(k, v);
    }
    for (const [k, v] of values) to.set(k, v);
    for (const [k, v] of values) {
      if (to.getString(k) !== v) return { ok: false, count: values.size, why: `read-back of "${k.startsWith('img:') ? 'a photo' : k}" differed` };
    }
    const extra = to.getAllKeys().filter((k) => !values.has(k));
    if (extra.length) return { ok: false, count: values.size, why: `${extra.length} unexpected entries in the new store` };
    return { ok: true, count: values.size };
  } catch (e) {
    return { ok: false, count: 0, why: String((e as any)?.message ?? e) };
  }
}
