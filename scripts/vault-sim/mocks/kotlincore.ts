// A stand-in for the Kotlin vault core v2–v6 (modules/memoairem-vault: VaultKeys.kt + the module), for
// the node sims. Its own "Keystore": secrets + a fingerprint copy that needs a (simulated) touch,
// that Android destroys when a fingerprint is added, and switches to make it misbehave.
import { scrypt } from '@noble/hashes/scrypt';

export function makeCore(version = 2) {
  const ctl = {
    secrets: new Map<string, string>(),
    bio: null as string | null,
    cancel: false, // the person closes the prompt
    invalidated: false, // a fingerprint was added → the key is gone
    available: true, // a strong fingerprint is enrolled
    lieOnReadBack: false, // secretGet returns something else
    failSave: false, // bioSave fails with an unexpected error
    touches: 0,
    // v3 storage: folders on "disk" — id → { k, entries }; survives restarts like real files
    folders: new Map<string, { k: string; entries: Map<string, string> }>(),
    storeLie: false, // reads back something else
    storeBroken: false, // every read throws (damage / a bug)
    // v4 autofill
    autofillId: null as string | null,
    autofillEnabled: false,
    // v5 (phase 3): the PIN's locked copy for autofill + the shared wrong-PIN count
    pinCopy: null as string | null,
    fails: { n: 0, until: 0 },
    // v6: the coded site list (here: the plain sites it was given, to check what the app sends)
    indexSites: null as string[] | null,
  };
  const err = (code: string) => Object.assign(new Error(code), { code });
  const touch = () => {
    ctl.touches++;
    if (ctl.cancel) throw err('ERR_CANCELLED');
  };
  const mod: any = {
    coreVersion: () => version,
    scryptHex: async (pw: string, salt: string, n: number, r: number, p: number, dk: number) =>
      Buffer.from(scrypt(Buffer.from(pw, 'hex'), Buffer.from(salt, 'hex'), { N: n, r, p, dkLen: dk })).toString('hex'),
  };
  if (version >= 2) {
    Object.assign(mod, {
      secretPut: async (name: string, v: string) => { ctl.secrets.set(name, v); },
      secretGet: async (name: string) => (ctl.lieOnReadBack ? 'ff'.repeat(32) : ctl.secrets.get(name) ?? null),
      secretDelete: async (name: string) => { ctl.secrets.delete(name); },
      bioAvailable: () => ctl.available,
      bioSaved: () => ctl.bio !== null,
      bioSave: async (v: string) => {
        if (!ctl.available) throw err('ERR_UNAVAILABLE');
        if (ctl.failSave) throw err('ERR_BIO');
        touch();
        ctl.bio = v;
        ctl.invalidated = false; // a fresh key
        return true;
      },
      bioOpen: async () => {
        if (ctl.bio === null) throw err('ERR_NONE');
        if (ctl.invalidated) { ctl.bio = null; throw err('ERR_INVALIDATED'); }
        touch();
        return ctl.bio;
      },
      bioDelete: async () => { ctl.bio = null; },
    });
  }
  if (version >= 3) {
    let cur: { id: string; k: string } | null = null;
    const folder = () => {
      if (!cur) throw new Error('Private folder storage is not open');
      const f = ctl.folders.get(cur.id);
      return f;
    };
    Object.assign(mod, {
      storeExists: (id: string) => (ctl.folders.get(id)?.entries.size ?? 0) > 0,
      storeOpen: (id: string, k: string) => {
        if (!/^vault(-[A-Za-z0-9_-]{8,})?$/.test(id)) throw new Error('bad folder id');
        cur = { id, k };
        return (ctl.folders.get(id)?.entries.size ?? 0) > 0;
      },
      storeGet: (name: string) => {
        const f = folder();
        if (!f || !f.entries.has(name)) return null;
        if (ctl.storeBroken) throw new Error('AEADBadTagException');
        if (f.k !== cur!.k) throw new Error('AEADBadTagException'); // GCM: wrong key never reads as empty
        return ctl.storeLie ? f.entries.get(name) + 'x' : f.entries.get(name)!;
      },
      storeSet: (name: string, v: string) => {
        let f = folder();
        if (!f) { f = { k: cur!.k, entries: new Map() }; ctl.folders.set(cur!.id, f); }
        if (f.k !== cur!.k) throw new Error('written with another key'); // never happens: same id = same K
        f.entries.set(name, v);
      },
      storeRemove: (name: string) => { folder()?.entries.delete(name); },
      storeKeys: () => [...(folder()?.entries.keys() ?? [])].sort(),
      storeClose: () => { cur = null; },
      storeDelete: (id: string) => { if (cur?.id === id) cur = null; ctl.folders.delete(id); return true; },
    });
  }
  if (version >= 4) {
    Object.assign(mod, {
      autofillSync: (id: string | null) => { ctl.autofillId = id; },
      autofillStatus: () => ({ supported: true, enabled: ctl.autofillEnabled, folder: ctl.autofillId !== null, fingerprint: ctl.bio !== null }),
      autofillOpenSettings: () => { ctl.autofillEnabled = true; return true; },
    });
  }
  if (version >= 5) {
    Object.assign(mod, {
      autofillStatus: () => ({ supported: true, enabled: ctl.autofillEnabled, folder: ctl.autofillId !== null, fingerprint: ctl.bio !== null, pin: ctl.pinCopy !== null && ctl.secrets.has('pepper') }),
      autofillPinSync: (json: string | null) => { ctl.pinCopy = json; },
      failsGet: () => ({ ...ctl.fails }),
      failsSet: (n: number, until: number) => { ctl.fails = { n, until }; },
    });
  }
  if (version >= 6) {
    Object.assign(mod, {
      autofillIndexSync: (sites: string[] | null) => { ctl.indexSites = sites ? [...sites] : null; },
    });
  }
  return { mod, ctl };
}
