"use strict";

// scripts/vault-sim/mocks/mmkv.ts
var disk = /* @__PURE__ */ new Map();
var cache = /* @__PURE__ */ new Map();
function restartApp() {
  cache = /* @__PURE__ */ new Map();
}
function createMMKV(o = {}) {
  const id = o.id ?? "default";
  if (cache.has(id)) return cache.get(id);
  const key = o.encryptionKey;
  const d = disk.get(id) ?? { writtenWith: key, data: /* @__PURE__ */ new Map() };
  disk.set(id, d);
  const readable = d.data.size === 0 || d.writtenWith === key;
  if (!readable) d.data = /* @__PURE__ */ new Map();
  d.writtenWith = key;
  const inst = {
    getString: (k) => d.data.get(k),
    set: (k, v) => d.data.set(k, v),
    remove: (k) => d.data.delete(k),
    clearAll: () => d.data.clear(),
    trim() {
    },
    contains: (k) => d.data.has(k),
    getAllKeys: () => [...d.data.keys()]
  };
  cache.set(id, inst);
  return inst;
}
function deleteMMKV(id) {
  cache.delete(id);
  return disk.delete(id);
}

// scripts/vault-sim/mocks/securestore.ts
var store = /* @__PURE__ */ new Map();
var authed = /* @__PURE__ */ new Set();
var bio = { cancel: false, invalidated: false, prompts: 0, enrolled: true };
async function getItemAsync(k, o = {}) {
  if (authed.has(k)) {
    if (!o.requireAuthentication) throw new Error("auth entry read without requireAuthentication");
    bio.prompts++;
    if (!bio.enrolled) throw new Error("No biometrics are currently enrolled");
    if (bio.cancel) throw new Error("User canceled the authentication");
    if (bio.invalidated) return null;
  }
  return store.get(k) ?? null;
}
async function setItemAsync(k, v, o = {}) {
  if (o.requireAuthentication) {
    bio.prompts++;
    if (!bio.enrolled) throw new Error("No biometrics are currently enrolled");
    if (bio.cancel) throw new Error("User canceled the authentication");
    authed.add(k);
    bio.invalidated = false;
  } else authed.delete(k);
  store.set(k, v);
}
async function deleteItemAsync(k) {
  store.delete(k);
  authed.delete(k);
}
function clearAll() {
  store.clear();
  authed.clear();
}

// scripts/vault-sim/mocks/localauth.ts
var SecurityLevel = { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 };
var ctl = { level: 3, success: true, lastOptions: null };
async function getEnrolledLevelAsync() {
  return ctl.level;
}

// scripts/vault-sim/mocks/crypto.ts
var import_node_crypto = require("node:crypto");
function getRandomBytes(n) {
  return new Uint8Array((0, import_node_crypto.randomBytes)(n));
}

// src/lib/persist.ts
var mmkv = createMMKV();
var persist = {
  getString(key) {
    return mmkv.getString(key);
  },
  set(key, value) {
    mmkv.set(key, value);
  },
  delete(key) {
    mmkv.remove(key);
  },
  has(key) {
    return mmkv.contains(key);
  },
  getAllKeys() {
    return mmkv.getAllKeys();
  },
  /** Shrink the MMKV file after a bulk delete — MMKV never resizes itself (the test
   * device's file pre-grew to 128MB). Safe to call any time; best-effort. */
  trim() {
    try {
      mmkv.trim();
    } catch {
    }
  }
};

// src/lib/query.ts
var DAY_WORDS = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  "twenty-first": 21,
  "twenty-second": 22,
  "twenty-third": 23,
  "twenty-fourth": 24,
  "twenty-fifth": 25,
  "twenty-sixth": 26,
  "twenty-seventh": 27,
  "twenty-eighth": 28,
  "twenty-ninth": 29,
  thirtieth: 30,
  "thirty-first": 31
};
var MONTH_PAT = "(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)(?![a-z])";
var DAY_PAT = "(\\d{1,2}(?:st|nd|rd|th)?|" + // longest words first so "twenty-first" wins over "first", "thirteenth" over "third", etc.
Object.keys(DAY_WORDS).sort((a, b) => b.length - a.length).map((w) => w.replace(/-/g, "[- ]")).join("|") + ")";
var MD_FWD = new RegExp("\\b" + MONTH_PAT + "\\.?\\s+" + DAY_PAT + "\\b", "i");
var MD_REV = new RegExp("\\b" + DAY_PAT + "\\s+(?:of\\s+)?" + MONTH_PAT + "\\b", "i");
var COUNT_PAT = "(\\d{1,2}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a\\s+couple\\s+of)";
var YEAR_PAT = "((?:19|20)\\d{2})";
var YEAR_TAIL = `(?:,?\\s+(?:of\\s+|in\\s+)?(?:${YEAR_PAT}|(next|this)\\s+year))?`;
var RX_MD_Y = new RegExp("\\b" + MONTH_PAT + "\\.?\\s+" + DAY_PAT + "\\b" + YEAR_TAIL, "i");
var RX_DM_Y = new RegExp("\\b" + DAY_PAT + "\\s+(?:of\\s+)?" + MONTH_PAT + "\\b" + YEAR_TAIL, "i");
var RX_MONTH_Y = new RegExp(`\\b(?:in\\s+)?${MONTH_PAT}\\s+(?:of\\s+)?(?:${YEAR_PAT}|(next|this)\\s+year)\\b`, "i");
var RX_Y_MONTH = new RegExp(`\\b(next|this)\\s+year,?\\s+(?:in\\s+)?${MONTH_PAT}\\b`, "i");
var RX_IN_N = new RegExp(`\\bin\\s+${COUNT_PAT}\\s+(day|week|month|year)s?\\b`, "i");
var RX_N_FROM_NOW = new RegExp(`\\b${COUNT_PAT}\\s+(day|week|month|year)s?\\s+from\\s+(?:now|today)\\b`, "i");
var RX_BARE_YEAR = new RegExp(`\\b(?:in|for|during|by|of)\\s+${YEAR_PAT}\\b`, "i");

// src/lib/privateDocs.ts
var PRIVATE_DOC_TYPE = "private-doc";
function packDocNotes(issued, notes) {
  const body = notes.trim();
  const out = (issued ? `Issued: ${issued}` + (body ? "\n" : "") : "") + body;
  return out || null;
}

// src/lib/sites.ts
function normalizeSite(input) {
  const t = (input ?? "").trim();
  if (!t) return null;
  const looksLikeAddress = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) || /^[^\s/]+\.[a-z]{2,}(?:[:/?#].*)?$/i.test(t) && !/\s/.test(t);
  if (!looksLikeAddress) return t.slice(0, 100);
  const host = t.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/^[^@/]*@/, "").split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/\.$/, "").toLowerCase().replace(/^www\d*\./, "");
  return host || null;
}

// scripts/vault-sim/mocks/expo.ts
var nativeCtl = { mod: null };
function requireOptionalNativeModule(name) {
  return name === "MemoairemVault" ? nativeCtl.mod : null;
}

// node_modules/@noble/ciphers/esm/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function abool(b) {
  if (typeof b !== "boolean")
    throw new Error(`boolean expected, not ${b}`);
}
function abytes(b, ...lengths) {
  if (!isBytes(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function u8(arr) {
  return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
}
function u32(arr) {
  return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
var isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  else if (isBytes(data))
    data = copyBytes(data);
  else
    throw new Error("Uint8Array expected, got " + typeof data);
  return data;
}
function equalBytes(a, b) {
  if (a.length !== b.length)
    return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++)
    diff |= a[i] ^ b[i];
  return diff === 0;
}
var wrapCipher = /* @__NO_SIDE_EFFECTS__ */ (params, constructor) => {
  function wrappedCipher(key, ...args) {
    abytes(key);
    if (!isLE)
      throw new Error("Non little-endian hardware is not yet supported");
    if (params.nonceLength !== void 0) {
      const nonce = args[0];
      if (!nonce)
        throw new Error("nonce / iv required");
      if (params.varSizeNonce)
        abytes(nonce);
      else
        abytes(nonce, params.nonceLength);
    }
    const tagl = params.tagLength;
    if (tagl && args[1] !== void 0) {
      abytes(args[1]);
    }
    const cipher = constructor(key, ...args);
    const checkOutput = (fnLength, output) => {
      if (output !== void 0) {
        if (fnLength !== 2)
          throw new Error("cipher output not supported");
        abytes(output);
      }
    };
    let called = false;
    const wrCipher = {
      encrypt(data, output) {
        if (called)
          throw new Error("cannot encrypt() twice with same key + nonce");
        called = true;
        abytes(data);
        checkOutput(cipher.encrypt.length, output);
        return cipher.encrypt(data, output);
      },
      decrypt(data, output) {
        abytes(data);
        if (tagl && data.length < tagl)
          throw new Error("invalid ciphertext length: smaller than tagLength=" + tagl);
        checkOutput(cipher.decrypt.length, output);
        return cipher.decrypt(data, output);
      }
    };
    return wrCipher;
  }
  Object.assign(wrappedCipher, params);
  return wrappedCipher;
};
function getOutput(expectedLength, out, onlyAligned = true) {
  if (out === void 0)
    return new Uint8Array(expectedLength);
  if (out.length !== expectedLength)
    throw new Error("invalid output length, expected " + expectedLength + ", got: " + out.length);
  if (onlyAligned && !isAligned32(out))
    throw new Error("invalid output, must be aligned");
  return out;
}
function setBigUint64(view, byteOffset, value, isLE3) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE3);
  const _32n = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n & _u32_max);
  const wl = Number(value & _u32_max);
  const h = isLE3 ? 4 : 0;
  const l = isLE3 ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE3);
  view.setUint32(byteOffset + l, wl, isLE3);
}
function u64Lengths(dataLength, aadLength, isLE3) {
  abool(isLE3);
  const num = new Uint8Array(16);
  const view = createView(num);
  setBigUint64(view, 0, BigInt(aadLength), isLE3);
  setBigUint64(view, 8, BigInt(dataLength), isLE3);
  return num;
}
function isAligned32(bytes) {
  return bytes.byteOffset % 4 === 0;
}
function copyBytes(bytes) {
  return Uint8Array.from(bytes);
}

// node_modules/@noble/ciphers/esm/_polyval.js
var BLOCK_SIZE = 16;
var ZEROS16 = /* @__PURE__ */ new Uint8Array(16);
var ZEROS32 = u32(ZEROS16);
var POLY = 225;
var mul2 = (s0, s1, s2, s3) => {
  const hiBit = s3 & 1;
  return {
    s3: s2 << 31 | s3 >>> 1,
    s2: s1 << 31 | s2 >>> 1,
    s1: s0 << 31 | s1 >>> 1,
    s0: s0 >>> 1 ^ POLY << 24 & -(hiBit & 1)
    // reduce % poly
  };
};
var swapLE = (n) => (n >>> 0 & 255) << 24 | (n >>> 8 & 255) << 16 | (n >>> 16 & 255) << 8 | n >>> 24 & 255 | 0;
function _toGHASHKey(k) {
  k.reverse();
  const hiBit = k[15] & 1;
  let carry = 0;
  for (let i = 0; i < k.length; i++) {
    const t = k[i];
    k[i] = t >>> 1 | carry;
    carry = (t & 1) << 7;
  }
  k[0] ^= -hiBit & 225;
  return k;
}
var estimateWindow = (bytes) => {
  if (bytes > 64 * 1024)
    return 8;
  if (bytes > 1024)
    return 4;
  return 2;
};
var GHASH = class {
  // We select bits per window adaptively based on expectedLength
  constructor(key, expectedLength) {
    this.blockLen = BLOCK_SIZE;
    this.outputLen = BLOCK_SIZE;
    this.s0 = 0;
    this.s1 = 0;
    this.s2 = 0;
    this.s3 = 0;
    this.finished = false;
    key = toBytes(key);
    abytes(key, 16);
    const kView = createView(key);
    let k0 = kView.getUint32(0, false);
    let k1 = kView.getUint32(4, false);
    let k2 = kView.getUint32(8, false);
    let k3 = kView.getUint32(12, false);
    const doubles = [];
    for (let i = 0; i < 128; i++) {
      doubles.push({ s0: swapLE(k0), s1: swapLE(k1), s2: swapLE(k2), s3: swapLE(k3) });
      ({ s0: k0, s1: k1, s2: k2, s3: k3 } = mul2(k0, k1, k2, k3));
    }
    const W = estimateWindow(expectedLength || 1024);
    if (![1, 2, 4, 8].includes(W))
      throw new Error("ghash: invalid window size, expected 2, 4 or 8");
    this.W = W;
    const bits = 128;
    const windows = bits / W;
    const windowSize = this.windowSize = 2 ** W;
    const items = [];
    for (let w = 0; w < windows; w++) {
      for (let byte = 0; byte < windowSize; byte++) {
        let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
        for (let j = 0; j < W; j++) {
          const bit = byte >>> W - j - 1 & 1;
          if (!bit)
            continue;
          const { s0: d0, s1: d1, s2: d2, s3: d3 } = doubles[W * w + j];
          s0 ^= d0, s1 ^= d1, s2 ^= d2, s3 ^= d3;
        }
        items.push({ s0, s1, s2, s3 });
      }
    }
    this.t = items;
  }
  _updateBlock(s0, s1, s2, s3) {
    s0 ^= this.s0, s1 ^= this.s1, s2 ^= this.s2, s3 ^= this.s3;
    const { W, t, windowSize } = this;
    let o0 = 0, o1 = 0, o2 = 0, o3 = 0;
    const mask = (1 << W) - 1;
    let w = 0;
    for (const num of [s0, s1, s2, s3]) {
      for (let bytePos = 0; bytePos < 4; bytePos++) {
        const byte = num >>> 8 * bytePos & 255;
        for (let bitPos = 8 / W - 1; bitPos >= 0; bitPos--) {
          const bit = byte >>> W * bitPos & mask;
          const { s0: e0, s1: e1, s2: e2, s3: e3 } = t[w * windowSize + bit];
          o0 ^= e0, o1 ^= e1, o2 ^= e2, o3 ^= e3;
          w += 1;
        }
      }
    }
    this.s0 = o0;
    this.s1 = o1;
    this.s2 = o2;
    this.s3 = o3;
  }
  update(data) {
    aexists(this);
    data = toBytes(data);
    abytes(data);
    const b32 = u32(data);
    const blocks = Math.floor(data.length / BLOCK_SIZE);
    const left = data.length % BLOCK_SIZE;
    for (let i = 0; i < blocks; i++) {
      this._updateBlock(b32[i * 4 + 0], b32[i * 4 + 1], b32[i * 4 + 2], b32[i * 4 + 3]);
    }
    if (left) {
      ZEROS16.set(data.subarray(blocks * BLOCK_SIZE));
      this._updateBlock(ZEROS32[0], ZEROS32[1], ZEROS32[2], ZEROS32[3]);
      clean(ZEROS32);
    }
    return this;
  }
  destroy() {
    const { t } = this;
    for (const elm of t) {
      elm.s0 = 0, elm.s1 = 0, elm.s2 = 0, elm.s3 = 0;
    }
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { s0, s1, s2, s3 } = this;
    const o32 = u32(out);
    o32[0] = s0;
    o32[1] = s1;
    o32[2] = s2;
    o32[3] = s3;
    return out;
  }
  digest() {
    const res = new Uint8Array(BLOCK_SIZE);
    this.digestInto(res);
    this.destroy();
    return res;
  }
};
var Polyval = class extends GHASH {
  constructor(key, expectedLength) {
    key = toBytes(key);
    abytes(key);
    const ghKey = _toGHASHKey(copyBytes(key));
    super(ghKey, expectedLength);
    clean(ghKey);
  }
  update(data) {
    data = toBytes(data);
    aexists(this);
    const b32 = u32(data);
    const left = data.length % BLOCK_SIZE;
    const blocks = Math.floor(data.length / BLOCK_SIZE);
    for (let i = 0; i < blocks; i++) {
      this._updateBlock(swapLE(b32[i * 4 + 3]), swapLE(b32[i * 4 + 2]), swapLE(b32[i * 4 + 1]), swapLE(b32[i * 4 + 0]));
    }
    if (left) {
      ZEROS16.set(data.subarray(blocks * BLOCK_SIZE));
      this._updateBlock(swapLE(ZEROS32[3]), swapLE(ZEROS32[2]), swapLE(ZEROS32[1]), swapLE(ZEROS32[0]));
      clean(ZEROS32);
    }
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { s0, s1, s2, s3 } = this;
    const o32 = u32(out);
    o32[0] = s0;
    o32[1] = s1;
    o32[2] = s2;
    o32[3] = s3;
    return out.reverse();
  }
};
function wrapConstructorWithKey(hashCons) {
  const hashC = (msg, key) => hashCons(key, msg.length).update(toBytes(msg)).digest();
  const tmp = hashCons(new Uint8Array(16), 0);
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = (key, expectedLength) => hashCons(key, expectedLength);
  return hashC;
}
var ghash = wrapConstructorWithKey((key, expectedLength) => new GHASH(key, expectedLength));
var polyval = wrapConstructorWithKey((key, expectedLength) => new Polyval(key, expectedLength));

// node_modules/@noble/ciphers/esm/aes.js
var BLOCK_SIZE2 = 16;
var BLOCK_SIZE32 = 4;
var EMPTY_BLOCK = /* @__PURE__ */ new Uint8Array(BLOCK_SIZE2);
var POLY2 = 283;
function mul22(n) {
  return n << 1 ^ POLY2 & -(n >> 7);
}
function mul(a, b) {
  let res = 0;
  for (; b > 0; b >>= 1) {
    res ^= a & -(b & 1);
    a = mul22(a);
  }
  return res;
}
var sbox = /* @__PURE__ */ (() => {
  const t = new Uint8Array(256);
  for (let i = 0, x = 1; i < 256; i++, x ^= mul22(x))
    t[i] = x;
  const box = new Uint8Array(256);
  box[0] = 99;
  for (let i = 0; i < 255; i++) {
    let x = t[255 - i];
    x |= x << 8;
    box[t[i]] = (x ^ x >> 4 ^ x >> 5 ^ x >> 6 ^ x >> 7 ^ 99) & 255;
  }
  clean(t);
  return box;
})();
var rotr32_8 = (n) => n << 24 | n >>> 8;
var rotl32_8 = (n) => n << 8 | n >>> 24;
function genTtable(sbox2, fn) {
  if (sbox2.length !== 256)
    throw new Error("Wrong sbox length");
  const T0 = new Uint32Array(256).map((_, j) => fn(sbox2[j]));
  const T1 = T0.map(rotl32_8);
  const T2 = T1.map(rotl32_8);
  const T3 = T2.map(rotl32_8);
  const T01 = new Uint32Array(256 * 256);
  const T23 = new Uint32Array(256 * 256);
  const sbox22 = new Uint16Array(256 * 256);
  for (let i = 0; i < 256; i++) {
    for (let j = 0; j < 256; j++) {
      const idx = i * 256 + j;
      T01[idx] = T0[i] ^ T1[j];
      T23[idx] = T2[i] ^ T3[j];
      sbox22[idx] = sbox2[i] << 8 | sbox2[j];
    }
  }
  return { sbox: sbox2, sbox2: sbox22, T0, T1, T2, T3, T01, T23 };
}
var tableEncoding = /* @__PURE__ */ genTtable(sbox, (s) => mul(s, 3) << 24 | s << 16 | s << 8 | mul(s, 2));
var xPowers = /* @__PURE__ */ (() => {
  const p = new Uint8Array(16);
  for (let i = 0, x = 1; i < 16; i++, x = mul22(x))
    p[i] = x;
  return p;
})();
function expandKeyLE(key) {
  abytes(key);
  const len = key.length;
  if (![16, 24, 32].includes(len))
    throw new Error("aes: invalid key size, should be 16, 24 or 32, got " + len);
  const { sbox2 } = tableEncoding;
  const toClean = [];
  if (!isAligned32(key))
    toClean.push(key = copyBytes(key));
  const k32 = u32(key);
  const Nk = k32.length;
  const subByte = (n) => applySbox(sbox2, n, n, n, n);
  const xk = new Uint32Array(len + 28);
  xk.set(k32);
  for (let i = Nk; i < xk.length; i++) {
    let t = xk[i - 1];
    if (i % Nk === 0)
      t = subByte(rotr32_8(t)) ^ xPowers[i / Nk - 1];
    else if (Nk > 6 && i % Nk === 4)
      t = subByte(t);
    xk[i] = xk[i - Nk] ^ t;
  }
  clean(...toClean);
  return xk;
}
function apply0123(T01, T23, s0, s1, s2, s3) {
  return T01[s0 << 8 & 65280 | s1 >>> 8 & 255] ^ T23[s2 >>> 8 & 65280 | s3 >>> 24 & 255];
}
function applySbox(sbox2, s0, s1, s2, s3) {
  return sbox2[s0 & 255 | s1 & 65280] | sbox2[s2 >>> 16 & 255 | s3 >>> 16 & 65280] << 16;
}
function encrypt(xk, s0, s1, s2, s3) {
  const { sbox2, T01, T23 } = tableEncoding;
  let k = 0;
  s0 ^= xk[k++], s1 ^= xk[k++], s2 ^= xk[k++], s3 ^= xk[k++];
  const rounds = xk.length / 4 - 2;
  for (let i = 0; i < rounds; i++) {
    const t02 = xk[k++] ^ apply0123(T01, T23, s0, s1, s2, s3);
    const t12 = xk[k++] ^ apply0123(T01, T23, s1, s2, s3, s0);
    const t22 = xk[k++] ^ apply0123(T01, T23, s2, s3, s0, s1);
    const t32 = xk[k++] ^ apply0123(T01, T23, s3, s0, s1, s2);
    s0 = t02, s1 = t12, s2 = t22, s3 = t32;
  }
  const t0 = xk[k++] ^ applySbox(sbox2, s0, s1, s2, s3);
  const t1 = xk[k++] ^ applySbox(sbox2, s1, s2, s3, s0);
  const t2 = xk[k++] ^ applySbox(sbox2, s2, s3, s0, s1);
  const t3 = xk[k++] ^ applySbox(sbox2, s3, s0, s1, s2);
  return { s0: t0, s1: t1, s2: t2, s3: t3 };
}
function ctr32(xk, isLE3, nonce, src, dst) {
  abytes(nonce, BLOCK_SIZE2);
  abytes(src);
  dst = getOutput(src.length, dst);
  const ctr = nonce;
  const c32 = u32(ctr);
  const view = createView(ctr);
  const src32 = u32(src);
  const dst32 = u32(dst);
  const ctrPos = isLE3 ? 0 : 12;
  const srcLen = src.length;
  let ctrNum = view.getUint32(ctrPos, isLE3);
  let { s0, s1, s2, s3 } = encrypt(xk, c32[0], c32[1], c32[2], c32[3]);
  for (let i = 0; i + 4 <= src32.length; i += 4) {
    dst32[i + 0] = src32[i + 0] ^ s0;
    dst32[i + 1] = src32[i + 1] ^ s1;
    dst32[i + 2] = src32[i + 2] ^ s2;
    dst32[i + 3] = src32[i + 3] ^ s3;
    ctrNum = ctrNum + 1 >>> 0;
    view.setUint32(ctrPos, ctrNum, isLE3);
    ({ s0, s1, s2, s3 } = encrypt(xk, c32[0], c32[1], c32[2], c32[3]));
  }
  const start = BLOCK_SIZE2 * Math.floor(src32.length / BLOCK_SIZE32);
  if (start < srcLen) {
    const b32 = new Uint32Array([s0, s1, s2, s3]);
    const buf = u8(b32);
    for (let i = start, pos = 0; i < srcLen; i++, pos++)
      dst[i] = src[i] ^ buf[pos];
    clean(b32);
  }
  return dst;
}
function computeTag(fn, isLE3, key, data, AAD) {
  const aadLength = AAD ? AAD.length : 0;
  const h = fn.create(key, data.length + aadLength);
  if (AAD)
    h.update(AAD);
  const num = u64Lengths(8 * data.length, 8 * aadLength, isLE3);
  h.update(data);
  h.update(num);
  const res = h.digest();
  clean(num);
  return res;
}
var gcm = /* @__PURE__ */ wrapCipher({ blockSize: 16, nonceLength: 12, tagLength: 16, varSizeNonce: true }, function aesgcm(key, nonce, AAD) {
  if (nonce.length < 8)
    throw new Error("aes/gcm: invalid nonce length");
  const tagLength = 16;
  function _computeTag(authKey, tagMask, data) {
    const tag = computeTag(ghash, false, authKey, data, AAD);
    for (let i = 0; i < tagMask.length; i++)
      tag[i] ^= tagMask[i];
    return tag;
  }
  function deriveKeys() {
    const xk = expandKeyLE(key);
    const authKey = EMPTY_BLOCK.slice();
    const counter = EMPTY_BLOCK.slice();
    ctr32(xk, false, counter, counter, authKey);
    if (nonce.length === 12) {
      counter.set(nonce);
    } else {
      const nonceLen = EMPTY_BLOCK.slice();
      const view = createView(nonceLen);
      setBigUint64(view, 8, BigInt(nonce.length * 8), false);
      const g = ghash.create(authKey).update(nonce).update(nonceLen);
      g.digestInto(counter);
      g.destroy();
    }
    const tagMask = ctr32(xk, false, counter, EMPTY_BLOCK);
    return { xk, authKey, counter, tagMask };
  }
  return {
    encrypt(plaintext) {
      const { xk, authKey, counter, tagMask } = deriveKeys();
      const out = new Uint8Array(plaintext.length + tagLength);
      const toClean = [xk, authKey, counter, tagMask];
      if (!isAligned32(plaintext))
        toClean.push(plaintext = copyBytes(plaintext));
      ctr32(xk, false, counter, plaintext, out.subarray(0, plaintext.length));
      const tag = _computeTag(authKey, tagMask, out.subarray(0, out.length - tagLength));
      toClean.push(tag);
      out.set(tag, plaintext.length);
      clean(...toClean);
      return out;
    },
    decrypt(ciphertext) {
      const { xk, authKey, counter, tagMask } = deriveKeys();
      const toClean = [xk, authKey, tagMask, counter];
      if (!isAligned32(ciphertext))
        toClean.push(ciphertext = copyBytes(ciphertext));
      const data = ciphertext.subarray(0, -tagLength);
      const passedTag = ciphertext.subarray(-tagLength);
      const tag = _computeTag(authKey, tagMask, data);
      toClean.push(tag);
      if (!equalBytes(tag, passedTag))
        throw new Error("aes/gcm: invalid ghash tag");
      const out = ctr32(xk, false, counter, data);
      clean(...toClean);
      return out;
    }
  };
});

// node_modules/@noble/hashes/esm/utils.js
function isBytes2(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function anumber(n) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("positive integer expected, got " + n);
}
function abytes2(b, ...lengths) {
  if (!isBytes2(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function ahash(h) {
  if (typeof h !== "function" || typeof h.create !== "function")
    throw new Error("Hash should be wrapped by utils.createHasher");
  anumber(h.outputLen);
  anumber(h.blockLen);
}
function aexists2(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput2(out, instance) {
  abytes2(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function u322(arr) {
  return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
function clean2(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView2(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
function rotl(word, shift) {
  return word << shift | word >>> 32 - shift >>> 0;
}
var isLE2 = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
function byteSwap(word) {
  return word << 24 & 4278190080 | word << 8 & 16711680 | word >>> 8 & 65280 | word >>> 24 & 255;
}
function byteSwap32(arr) {
  for (let i = 0; i < arr.length; i++) {
    arr[i] = byteSwap(arr[i]);
  }
  return arr;
}
var swap32IfBE = isLE2 ? (u) => u : byteSwap32;
var hasHexBuiltin = /* @__PURE__ */ (() => (
  // @ts-ignore
  typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
))();
var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function bytesToHex(bytes) {
  abytes2(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
var asciis = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function asciiToBase16(ch) {
  if (ch >= asciis._0 && ch <= asciis._9)
    return ch - asciis._0;
  if (ch >= asciis.A && ch <= asciis.F)
    return ch - (asciis.A - 10);
  if (ch >= asciis.a && ch <= asciis.f)
    return ch - (asciis.a - 10);
  return;
}
function hexToBytes(hex) {
  if (typeof hex !== "string")
    throw new Error("hex string expected, got " + typeof hex);
  if (hasHexBuiltin)
    return Uint8Array.fromHex(hex);
  const hl = hex.length;
  const al = hl / 2;
  if (hl % 2)
    throw new Error("hex string expected, got unpadded hex of length " + hl);
  const array = new Uint8Array(al);
  for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
    const n1 = asciiToBase16(hex.charCodeAt(hi));
    const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
    if (n1 === void 0 || n2 === void 0) {
      const char = hex[hi] + hex[hi + 1];
      throw new Error('hex string expected, got non-hex character "' + char + '" at index ' + hi);
    }
    array[ai] = n1 * 16 + n2;
  }
  return array;
}
var nextTick = async () => {
};
async function asyncLoop(iters, tick, cb) {
  let ts = Date.now();
  for (let i = 0; i < iters; i++) {
    cb(i);
    const diff = Date.now() - ts;
    if (diff >= 0 && diff < tick)
      continue;
    await nextTick();
    ts += diff;
  }
}
function utf8ToBytes2(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes2(data) {
  if (typeof data === "string")
    data = utf8ToBytes2(data);
  abytes2(data);
  return data;
}
function kdfInputToBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes2(data);
  abytes2(data);
  return data;
}
function concatBytes2(...arrays) {
  let sum = 0;
  for (let i = 0; i < arrays.length; i++) {
    const a = arrays[i];
    abytes2(a);
    sum += a.length;
  }
  const res = new Uint8Array(sum);
  for (let i = 0, pad = 0; i < arrays.length; i++) {
    const a = arrays[i];
    res.set(a, pad);
    pad += a.length;
  }
  return res;
}
function checkOpts(defaults, opts) {
  if (opts !== void 0 && {}.toString.call(opts) !== "[object Object]")
    throw new Error("options should be object or undefined");
  const merged = Object.assign(defaults, opts);
  return merged;
}
var Hash2 = class {
};
function createHasher(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes2(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}

// node_modules/@noble/hashes/esm/hmac.js
var HMAC = class extends Hash2 {
  constructor(hash, _key) {
    super();
    this.finished = false;
    this.destroyed = false;
    ahash(hash);
    const key = toBytes2(_key);
    this.iHash = hash.create();
    if (typeof this.iHash.update !== "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen;
    this.outputLen = this.iHash.outputLen;
    const blockLen = this.blockLen;
    const pad = new Uint8Array(blockLen);
    pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
    for (let i = 0; i < pad.length; i++)
      pad[i] ^= 54;
    this.iHash.update(pad);
    this.oHash = hash.create();
    for (let i = 0; i < pad.length; i++)
      pad[i] ^= 54 ^ 92;
    this.oHash.update(pad);
    clean2(pad);
  }
  update(buf) {
    aexists2(this);
    this.iHash.update(buf);
    return this;
  }
  digestInto(out) {
    aexists2(this);
    abytes2(out, this.outputLen);
    this.finished = true;
    this.iHash.digestInto(out);
    this.oHash.update(out);
    this.oHash.digestInto(out);
    this.destroy();
  }
  digest() {
    const out = new Uint8Array(this.oHash.outputLen);
    this.digestInto(out);
    return out;
  }
  _cloneInto(to) {
    to || (to = Object.create(Object.getPrototypeOf(this), {}));
    const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
    to = to;
    to.finished = finished;
    to.destroyed = destroyed;
    to.blockLen = blockLen;
    to.outputLen = outputLen;
    to.oHash = oHash._cloneInto(to.oHash);
    to.iHash = iHash._cloneInto(to.iHash);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
  destroy() {
    this.destroyed = true;
    this.oHash.destroy();
    this.iHash.destroy();
  }
};
var hmac = (hash, key, message) => new HMAC(hash, key).update(message).digest();
hmac.create = (hash, key) => new HMAC(hash, key);

// node_modules/@noble/hashes/esm/pbkdf2.js
function pbkdf2Init(hash, _password, _salt, _opts) {
  ahash(hash);
  const opts = checkOpts({ dkLen: 32, asyncTick: 10 }, _opts);
  const { c, dkLen, asyncTick } = opts;
  anumber(c);
  anumber(dkLen);
  anumber(asyncTick);
  if (c < 1)
    throw new Error("iterations (c) should be >= 1");
  const password = kdfInputToBytes(_password);
  const salt = kdfInputToBytes(_salt);
  const DK = new Uint8Array(dkLen);
  const PRF = hmac.create(hash, password);
  const PRFSalt = PRF._cloneInto().update(salt);
  return { c, dkLen, asyncTick, DK, PRF, PRFSalt };
}
function pbkdf2Output(PRF, PRFSalt, DK, prfW, u) {
  PRF.destroy();
  PRFSalt.destroy();
  if (prfW)
    prfW.destroy();
  clean2(u);
  return DK;
}
function pbkdf2(hash, password, salt, opts) {
  const { c, dkLen, DK, PRF, PRFSalt } = pbkdf2Init(hash, password, salt, opts);
  let prfW;
  const arr = new Uint8Array(4);
  const view = createView2(arr);
  const u = new Uint8Array(PRF.outputLen);
  for (let ti = 1, pos = 0; pos < dkLen; ti++, pos += PRF.outputLen) {
    const Ti = DK.subarray(pos, pos + PRF.outputLen);
    view.setInt32(0, ti, false);
    (prfW = PRFSalt._cloneInto(prfW)).update(arr).digestInto(u);
    Ti.set(u.subarray(0, Ti.length));
    for (let ui = 1; ui < c; ui++) {
      PRF._cloneInto(prfW).update(u).digestInto(u);
      for (let i = 0; i < Ti.length; i++)
        Ti[i] ^= u[i];
    }
  }
  return pbkdf2Output(PRF, PRFSalt, DK, prfW, u);
}

// node_modules/@noble/hashes/esm/_md.js
function setBigUint642(view, byteOffset, value, isLE3) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE3);
  const _32n = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n & _u32_max);
  const wl = Number(value & _u32_max);
  const h = isLE3 ? 4 : 0;
  const l = isLE3 ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE3);
  view.setUint32(byteOffset + l, wl, isLE3);
}
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD = class extends Hash2 {
  constructor(blockLen, outputLen, padOffset, isLE3) {
    super();
    this.finished = false;
    this.length = 0;
    this.pos = 0;
    this.destroyed = false;
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE3;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView2(this.buffer);
  }
  update(data) {
    aexists2(this);
    data = toBytes2(data);
    abytes2(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView2(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
      }
    }
    this.length += data.length;
    this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists2(this);
    aoutput2(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE: isLE3 } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    clean2(this.buffer.subarray(pos));
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      pos = 0;
    }
    for (let i = pos; i < blockLen; i++)
      buffer[i] = 0;
    setBigUint642(view, blockLen - 8, BigInt(this.length * 8), isLE3);
    this.process(view, 0);
    const oview = createView2(out);
    const len = this.outputLen;
    if (len % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const outLen = len / 4;
    const state = this.get();
    if (outLen > state.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE3);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneInto(to) {
    to || (to = new this.constructor());
    to.set(...this.get());
    const { blockLen, buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (length % blockLen)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);

// node_modules/@noble/hashes/esm/sha2.js
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA256 = class extends HashMD {
  constructor(outputLen = 32) {
    super(64, outputLen, 8, false);
    this.A = SHA256_IV[0] | 0;
    this.B = SHA256_IV[1] | 0;
    this.C = SHA256_IV[2] | 0;
    this.D = SHA256_IV[3] | 0;
    this.E = SHA256_IV[4] | 0;
    this.F = SHA256_IV[5] | 0;
    this.G = SHA256_IV[6] | 0;
    this.H = SHA256_IV[7] | 0;
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    clean2(SHA256_W);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean2(this.buffer);
  }
};
var sha256 = /* @__PURE__ */ createHasher(() => new SHA256());

// node_modules/@noble/hashes/esm/scrypt.js
function XorAndSalsa(prev, pi, input, ii, out, oi) {
  let y00 = prev[pi++] ^ input[ii++], y01 = prev[pi++] ^ input[ii++];
  let y02 = prev[pi++] ^ input[ii++], y03 = prev[pi++] ^ input[ii++];
  let y04 = prev[pi++] ^ input[ii++], y05 = prev[pi++] ^ input[ii++];
  let y06 = prev[pi++] ^ input[ii++], y07 = prev[pi++] ^ input[ii++];
  let y08 = prev[pi++] ^ input[ii++], y09 = prev[pi++] ^ input[ii++];
  let y10 = prev[pi++] ^ input[ii++], y11 = prev[pi++] ^ input[ii++];
  let y12 = prev[pi++] ^ input[ii++], y13 = prev[pi++] ^ input[ii++];
  let y14 = prev[pi++] ^ input[ii++], y15 = prev[pi++] ^ input[ii++];
  let x00 = y00, x01 = y01, x02 = y02, x03 = y03, x04 = y04, x05 = y05, x06 = y06, x07 = y07, x08 = y08, x09 = y09, x10 = y10, x11 = y11, x12 = y12, x13 = y13, x14 = y14, x15 = y15;
  for (let i = 0; i < 8; i += 2) {
    x04 ^= rotl(x00 + x12 | 0, 7);
    x08 ^= rotl(x04 + x00 | 0, 9);
    x12 ^= rotl(x08 + x04 | 0, 13);
    x00 ^= rotl(x12 + x08 | 0, 18);
    x09 ^= rotl(x05 + x01 | 0, 7);
    x13 ^= rotl(x09 + x05 | 0, 9);
    x01 ^= rotl(x13 + x09 | 0, 13);
    x05 ^= rotl(x01 + x13 | 0, 18);
    x14 ^= rotl(x10 + x06 | 0, 7);
    x02 ^= rotl(x14 + x10 | 0, 9);
    x06 ^= rotl(x02 + x14 | 0, 13);
    x10 ^= rotl(x06 + x02 | 0, 18);
    x03 ^= rotl(x15 + x11 | 0, 7);
    x07 ^= rotl(x03 + x15 | 0, 9);
    x11 ^= rotl(x07 + x03 | 0, 13);
    x15 ^= rotl(x11 + x07 | 0, 18);
    x01 ^= rotl(x00 + x03 | 0, 7);
    x02 ^= rotl(x01 + x00 | 0, 9);
    x03 ^= rotl(x02 + x01 | 0, 13);
    x00 ^= rotl(x03 + x02 | 0, 18);
    x06 ^= rotl(x05 + x04 | 0, 7);
    x07 ^= rotl(x06 + x05 | 0, 9);
    x04 ^= rotl(x07 + x06 | 0, 13);
    x05 ^= rotl(x04 + x07 | 0, 18);
    x11 ^= rotl(x10 + x09 | 0, 7);
    x08 ^= rotl(x11 + x10 | 0, 9);
    x09 ^= rotl(x08 + x11 | 0, 13);
    x10 ^= rotl(x09 + x08 | 0, 18);
    x12 ^= rotl(x15 + x14 | 0, 7);
    x13 ^= rotl(x12 + x15 | 0, 9);
    x14 ^= rotl(x13 + x12 | 0, 13);
    x15 ^= rotl(x14 + x13 | 0, 18);
  }
  out[oi++] = y00 + x00 | 0;
  out[oi++] = y01 + x01 | 0;
  out[oi++] = y02 + x02 | 0;
  out[oi++] = y03 + x03 | 0;
  out[oi++] = y04 + x04 | 0;
  out[oi++] = y05 + x05 | 0;
  out[oi++] = y06 + x06 | 0;
  out[oi++] = y07 + x07 | 0;
  out[oi++] = y08 + x08 | 0;
  out[oi++] = y09 + x09 | 0;
  out[oi++] = y10 + x10 | 0;
  out[oi++] = y11 + x11 | 0;
  out[oi++] = y12 + x12 | 0;
  out[oi++] = y13 + x13 | 0;
  out[oi++] = y14 + x14 | 0;
  out[oi++] = y15 + x15 | 0;
}
function BlockMix(input, ii, out, oi, r) {
  let head = oi + 0;
  let tail = oi + 16 * r;
  for (let i = 0; i < 16; i++)
    out[tail + i] = input[ii + (2 * r - 1) * 16 + i];
  for (let i = 0; i < r; i++, head += 16, ii += 16) {
    XorAndSalsa(out, tail, input, ii, out, head);
    if (i > 0)
      tail += 16;
    XorAndSalsa(out, head, input, ii += 16, out, tail);
  }
}
function scryptInit(password, salt, _opts) {
  const opts = checkOpts({
    dkLen: 32,
    asyncTick: 10,
    maxmem: 1024 ** 3 + 1024
  }, _opts);
  const { N, r, p, dkLen, asyncTick, maxmem, onProgress } = opts;
  anumber(N);
  anumber(r);
  anumber(p);
  anumber(dkLen);
  anumber(asyncTick);
  anumber(maxmem);
  if (onProgress !== void 0 && typeof onProgress !== "function")
    throw new Error("progressCb should be function");
  const blockSize = 128 * r;
  const blockSize32 = blockSize / 4;
  const pow32 = Math.pow(2, 32);
  if (N <= 1 || (N & N - 1) !== 0 || N > pow32) {
    throw new Error("Scrypt: N must be larger than 1, a power of 2, and less than 2^32");
  }
  if (p < 0 || p > (pow32 - 1) * 32 / blockSize) {
    throw new Error("Scrypt: p must be a positive integer less than or equal to ((2^32 - 1) * 32) / (128 * r)");
  }
  if (dkLen < 0 || dkLen > (pow32 - 1) * 32) {
    throw new Error("Scrypt: dkLen should be positive integer less than or equal to (2^32 - 1) * 32");
  }
  const memUsed = blockSize * (N + p);
  if (memUsed > maxmem) {
    throw new Error("Scrypt: memused is bigger than maxMem. Expected 128 * r * (N + p) > maxmem of " + maxmem);
  }
  const B = pbkdf2(sha256, password, salt, { c: 1, dkLen: blockSize * p });
  const B32 = u322(B);
  const V = u322(new Uint8Array(blockSize * N));
  const tmp = u322(new Uint8Array(blockSize));
  let blockMixCb = () => {
  };
  if (onProgress) {
    const totalBlockMix = 2 * N * p;
    const callbackPer = Math.max(Math.floor(totalBlockMix / 1e4), 1);
    let blockMixCnt = 0;
    blockMixCb = () => {
      blockMixCnt++;
      if (onProgress && (!(blockMixCnt % callbackPer) || blockMixCnt === totalBlockMix))
        onProgress(blockMixCnt / totalBlockMix);
    };
  }
  return { N, r, p, dkLen, blockSize32, V, B32, B, tmp, blockMixCb, asyncTick };
}
function scryptOutput(password, dkLen, B, V, tmp) {
  const res = pbkdf2(sha256, password, B, { c: 1, dkLen });
  clean2(B, V, tmp);
  return res;
}
function scrypt(password, salt, opts) {
  const { N, r, p, dkLen, blockSize32, V, B32, B, tmp, blockMixCb } = scryptInit(password, salt, opts);
  swap32IfBE(B32);
  for (let pi = 0; pi < p; pi++) {
    const Pi = blockSize32 * pi;
    for (let i = 0; i < blockSize32; i++)
      V[i] = B32[Pi + i];
    for (let i = 0, pos = 0; i < N - 1; i++) {
      BlockMix(V, pos, V, pos += blockSize32, r);
      blockMixCb();
    }
    BlockMix(V, (N - 1) * blockSize32, B32, Pi, r);
    blockMixCb();
    for (let i = 0; i < N; i++) {
      const j = B32[Pi + blockSize32 - 16] % N;
      for (let k = 0; k < blockSize32; k++)
        tmp[k] = B32[Pi + k] ^ V[j * blockSize32 + k];
      BlockMix(tmp, 0, B32, Pi, r);
      blockMixCb();
    }
  }
  swap32IfBE(B32);
  return scryptOutput(password, dkLen, B, V, tmp);
}
async function scryptAsync(password, salt, opts) {
  const { N, r, p, dkLen, blockSize32, V, B32, B, tmp, blockMixCb, asyncTick } = scryptInit(password, salt, opts);
  swap32IfBE(B32);
  for (let pi = 0; pi < p; pi++) {
    const Pi = blockSize32 * pi;
    for (let i = 0; i < blockSize32; i++)
      V[i] = B32[Pi + i];
    let pos = 0;
    await asyncLoop(N - 1, asyncTick, () => {
      BlockMix(V, pos, V, pos += blockSize32, r);
      blockMixCb();
    });
    BlockMix(V, (N - 1) * blockSize32, B32, Pi, r);
    blockMixCb();
    await asyncLoop(N, asyncTick, () => {
      const j = B32[Pi + blockSize32 - 16] % N;
      for (let k = 0; k < blockSize32; k++)
        tmp[k] = B32[Pi + k] ^ V[j * blockSize32 + k];
      BlockMix(tmp, 0, B32, Pi, r);
      blockMixCb();
    });
  }
  swap32IfBE(B32);
  return scryptOutput(password, dkLen, B, V, tmp);
}

// node_modules/@noble/hashes/esm/hkdf.js
function extract(hash, ikm, salt) {
  ahash(hash);
  if (salt === void 0)
    salt = new Uint8Array(hash.outputLen);
  return hmac(hash, toBytes2(salt), toBytes2(ikm));
}
var HKDF_COUNTER = /* @__PURE__ */ Uint8Array.from([0]);
var EMPTY_BUFFER = /* @__PURE__ */ Uint8Array.of();
function expand(hash, prk, info, length = 32) {
  ahash(hash);
  anumber(length);
  const olen = hash.outputLen;
  if (length > 255 * olen)
    throw new Error("Length should be <= 255*HashLen");
  const blocks = Math.ceil(length / olen);
  if (info === void 0)
    info = EMPTY_BUFFER;
  const okm = new Uint8Array(blocks * olen);
  const HMAC2 = hmac.create(hash, prk);
  const HMACTmp = HMAC2._cloneInto();
  const T = new Uint8Array(HMAC2.outputLen);
  for (let counter = 0; counter < blocks; counter++) {
    HKDF_COUNTER[0] = counter + 1;
    HMACTmp.update(counter === 0 ? EMPTY_BUFFER : T).update(info).update(HKDF_COUNTER).digestInto(T);
    okm.set(T, olen * counter);
    HMAC2._cloneInto(HMACTmp);
  }
  HMAC2.destroy();
  HMACTmp.destroy();
  clean2(T, HKDF_COUNTER);
  return okm.slice(0, length);
}
var hkdf = (hash, ikm, salt, info, length) => expand(hash, extract(hash, ikm, salt), info, length);

// src/lib/vaultCrypto.ts
var jsScrypt = (password, salt, opts) => scryptAsync(password, salt, opts);
var runScrypt = jsScrypt;
function useScrypt(fn) {
  runScrypt = fn;
}
var PIN_SCRYPT_N = 1 << 14;
var PIN_LENGTH = 6;
var SALT = utf8ToBytes2("memoairem-private");
var enc = (s) => utf8ToBytes2(s);
var dec = (b) => new TextDecoder().decode(b);
var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var B64_REV = (() => {
  const t = new Int16Array(256).fill(-1);
  for (let i = 0; i < 64; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();
function toB64(b) {
  const parts = [];
  const CHUNK = 3 * 4096;
  for (let off = 0; off < b.length; off += CHUNK) {
    const end = Math.min(off + CHUNK, b.length);
    let s = "";
    for (let i = off; i < end; i += 3) {
      const n = b[i] << 16 | (i + 1 < end ? b[i + 1] : 0) << 8 | (i + 2 < end ? b[i + 2] : 0);
      s += B64[n >> 18 & 63] + B64[n >> 12 & 63] + (i + 1 < end ? B64[n >> 6 & 63] : "=") + (i + 2 < end ? B64[n & 63] : "=");
    }
    parts.push(s);
  }
  return parts.join("");
}
function fromB64(s) {
  const clean3 = s.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor(clean3.length * 3 / 4));
  let o = 0;
  for (let i = 0; i < clean3.length; i += 4) {
    const a = B64_REV[clean3.charCodeAt(i)];
    const b = B64_REV[clean3.charCodeAt(i + 1)];
    const c = i + 2 < clean3.length ? B64_REV[clean3.charCodeAt(i + 2)] : -1;
    const d = i + 3 < clean3.length ? B64_REV[clean3.charCodeAt(i + 3)] : -1;
    const n = a << 18 | b << 12 | (c < 0 ? 0 : c) << 6 | (d < 0 ? 0 : d);
    if (o < out.length) out[o++] = n >> 16 & 255;
    if (c >= 0 && o < out.length) out[o++] = n >> 8 & 255;
    if (d >= 0 && o < out.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}
function seal(key, iv, plain, aad) {
  return { iv: bytesToHex(iv), ct: toB64(gcm(key, iv, enc(aad)).encrypt(plain)) };
}
function unseal(key, s, aad) {
  return gcm(key, hexToBytes(s.iv), enc(aad)).decrypt(fromB64(s.ct));
}
var sealText = (key, iv, text, aad) => seal(key, iv, enc(text), aad);
var unsealText = (key, s, aad) => dec(unseal(key, s, aad));
function isValidPin(pin) {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}
async function pinKey(pin, saltHex, pepperHex, n = PIN_SCRYPT_N) {
  const slow = await runScrypt(enc(pin), hexToBytes(saltHex), { N: n, r: 8, p: 1, dkLen: 32 });
  return hkdf(sha256, concatBytes2(slow, hexToBytes(pepperHex)), SALT, "pin-wrap v3", 32);
}
var QUESTION_SCRYPT_N = 1 << 15;
var RK_ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
var RECOVERY_CHARS = 25;
function makeRecoveryKey(random) {
  if (random.length < RECOVERY_CHARS) throw new Error("need 25 random bytes");
  let s = "";
  for (let i = 0; i < RECOVERY_CHARS; i++) s += RK_ALPHA[random[i] & 31];
  return formatRecoveryKey(s);
}
function normalizeRecoveryKey(typed) {
  const s = typed.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (s.length !== RECOVERY_CHARS) return null;
  for (const c of s) if (!RK_ALPHA.includes(c)) return null;
  return s;
}
function formatRecoveryKey(s) {
  return (s.match(/.{1,5}/g) ?? []).join("-");
}
function recoveryWrapKey(normalized) {
  return hkdf(sha256, enc(normalized), SALT, "recovery-wrap v3", 32);
}
function backupKey(normalized) {
  return hkdf(sha256, enc(normalized), SALT, "backup v1", 32);
}
function macKey(folderKey) {
  return hkdf(sha256, enc(folderKey), SALT, "items-mac v3", 32);
}
function mac(key, text) {
  return bytesToHex(hmac(sha256, key, enc(text)));
}
var BACKUP_MAGIC = "memoairem_private_backup";
function packBackup(key, iv, header, payload) {
  const h = JSON.stringify(header);
  const s = seal(key, iv, enc(payload), h);
  const file = { [BACKUP_MAGIC]: 1, h, iv: s.iv, ct: s.ct };
  return JSON.stringify(file);
}
function openBackup(key, text) {
  let f;
  try {
    f = JSON.parse(text);
    if (!f || f[BACKUP_MAGIC] !== 1 || typeof f.h !== "string" || typeof f.iv !== "string" || typeof f.ct !== "string") {
      return { ok: false, reason: "not-a-backup" };
    }
  } catch {
    return { ok: false, reason: "not-a-backup" };
  }
  try {
    const payload = dec(unseal(key, { iv: f.iv, ct: f.ct }, f.h));
    return { ok: true, header: JSON.parse(f.h), payload };
  } catch {
    return { ok: false, reason: "wrong-key" };
  }
}
function pinPause(fails) {
  if (fails < 5) return 0;
  return [30, 60, 300, 900][fails - 5] ?? 3600;
}

// src/lib/vaultNative.ts
var engine = "js";
var checked = null;
var proven = null;
var nativeScrypt = (m) => async (password, salt, o) => {
  try {
    return hexToBytes(await m.scryptHex(bytesToHex(password), bytesToHex(salt), o.N, o.r, o.p, o.dkLen));
  } catch (e) {
    console.log("[private] Kotlin core failed \u2014 back to JS:", String(e?.message ?? e));
    engine = "js";
    useScrypt(jsScrypt);
    return jsScrypt(password, salt, o);
  }
};
function checkVaultCore(mod = requireOptionalNativeModule("MemoairemVault")) {
  if (checked) return checked;
  checked = (async () => {
    if (!mod) {
      console.log("[private] vault core: JS (no Kotlin module in this build)");
      return;
    }
    try {
      const pw = getRandomBytes(12);
      const salt = getRandomBytes(16);
      const o = { N: 1024, r: 8, p: 1, dkLen: 32 };
      const [k, j] = await Promise.all([mod.scryptHex(bytesToHex(pw), bytesToHex(salt), o.N, o.r, o.p, o.dkLen), jsScrypt(pw, salt, o)]);
      if (k === bytesToHex(j)) {
        engine = "kotlin";
        proven = mod;
        useScrypt(nativeScrypt(mod));
        console.log(`[private] vault core: Kotlin v${mod.coreVersion()} (self-check matched JS)`);
      } else {
        console.log("[private] vault core: JS \u2014 Kotlin self-check DIFFERED, not used");
      }
    } catch (e) {
      console.log("[private] vault core: JS \u2014 Kotlin self-check failed:", String(e?.message ?? e));
    }
  })();
  return checked;
}
function vaultEngine() {
  return engine;
}
async function storeCore() {
  await checkVaultCore();
  try {
    return proven && proven.coreVersion() >= 3 && proven.storeOpen && proven.storeGet ? proven : null;
  } catch {
    return null;
  }
}
async function keyCore() {
  await checkVaultCore();
  try {
    return proven && proven.coreVersion() >= 2 && proven.secretGet && proven.bioOpen ? proven : null;
  } catch {
    return null;
  }
}
function resetVaultCoreForTests() {
  checked = null;
  proven = null;
  engine = "js";
  useScrypt(jsScrypt);
}

// src/lib/vaultStore.ts
function kotlinDb(core) {
  return {
    getString: (k) => core.storeGet(k) ?? void 0,
    set: (k, v) => core.storeSet(k, v),
    remove: (k) => core.storeRemove(k),
    trim: () => {
    },
    getAllKeys: () => core.storeKeys()
  };
}
function dualDb(main, old) {
  const both = (what, f) => {
    try {
      f();
    } catch (e) {
      console.log(`[private] storage: old copy not updated (${what}):`, String(e?.message ?? e));
    }
  };
  return {
    getString: (k) => main.getString(k),
    set: (k, v) => {
      main.set(k, v);
      both("set", () => old.set(k, v));
    },
    remove: (k) => {
      main.remove(k);
      both("remove", () => old.remove(k));
    },
    trim: () => both("trim", () => old.trim()),
    getAllKeys: () => main.getAllKeys()
  };
}
function copyAll(from, to) {
  try {
    const keys = from.getAllKeys();
    const values = /* @__PURE__ */ new Map();
    for (const k of keys) {
      const v = from.getString(k);
      if (typeof v === "string") values.set(k, v);
    }
    for (const [k, v] of values) to.set(k, v);
    for (const [k, v] of values) {
      if (to.getString(k) !== v) return { ok: false, count: values.size, why: `read-back of "${k.startsWith("img:") ? "a photo" : k}" differed` };
    }
    const extra = to.getAllKeys().filter((k) => !values.has(k));
    if (extra.length) return { ok: false, count: values.size, why: `${extra.length} unexpected entries in the new store` };
    return { ok: true, count: values.size };
  } catch (e) {
    return { ok: false, count: 0, why: String(e?.message ?? e) };
  }
}

// src/lib/vaultKeys.ts
var PEPPER_NAME = "memoairem_vault_pepper";
var BIO_NAME = "memoairem_vault_bio";
var AT = "vault_keys";
function where() {
  try {
    return JSON.parse(persist.getString(AT) ?? "{}") ?? {};
  } catch {
    return {};
  }
}
function setWhere(w) {
  if (!w.pepper && !w.bio) persist.delete(AT);
  else persist.set(AT, JSON.stringify(w));
}
var isPepper = (p) => !!p && /^[0-9a-f]{64}$/.test(p);
async function moveToKotlin(value) {
  const core = await keyCore();
  if (!core) return false;
  try {
    await core.secretPut("pepper", value);
    const back = await core.secretGet("pepper");
    if (back !== value) {
      console.log("[private] keys: Kotlin read-back differed \u2014 pepper stays in the old store");
      return false;
    }
    setWhere({ ...where(), pepper: "kotlin" });
    await deleteItemAsync(PEPPER_NAME).catch(() => {
    });
    console.log("[private] keys: PIN secret now kept by the Kotlin core");
    return true;
  } catch (e) {
    console.log("[private] keys: Kotlin could not take the PIN secret:", String(e?.message ?? e));
    return false;
  }
}
async function getPepper() {
  const w = where();
  if (w.pepper === "kotlin") {
    const core = await keyCore();
    const v = core ? await core.secretGet("pepper").catch(() => null) : null;
    if (isPepper(v)) return v;
    const old = await getItemAsync(PEPPER_NAME).catch(() => null);
    if (isPepper(old)) return old;
    if (!core) {
      console.log("[private] keys: the PIN secret is in the Kotlin core, which this build lacks");
    }
    return null;
  } else {
    const p = await getItemAsync(PEPPER_NAME).catch(() => null);
    if (isPepper(p)) {
      await moveToKotlin(p);
      return p;
    }
    return null;
  }
}
async function setPepper(value) {
  if (await moveToKotlin(value)) return;
  await setItemAsync(PEPPER_NAME, value);
  const w = where();
  delete w.pepper;
  setWhere(w);
}
var codeOf = (e) => String(e?.code ?? e?.message ?? e);
async function bioSave(k, title = "Turn on fingerprint unlock") {
  const core = await keyCore();
  if (core && core.bioAvailable()) {
    try {
      await core.bioSave(k, title);
      setWhere({ ...where(), bio: "kotlin-new" });
      console.log("[private] keys: fingerprint copy made by the Kotlin core");
      return true;
    } catch (e) {
      const c = codeOf(e);
      if (/CANCELLED|LOCKOUT/.test(c)) return false;
      console.log("[private] keys: Kotlin fingerprint copy failed (" + c + ") \u2014 using the old store");
    }
  }
  try {
    await setItemAsync(BIO_NAME, k, { requireAuthentication: true, authenticationPrompt: title });
    const w = where();
    delete w.bio;
    setWhere(w);
    return true;
  } catch {
    return false;
  }
}
async function deleteAllKeys() {
  const core = await keyCore();
  if (core) {
    await core.secretDelete("pepper").catch(() => {
    });
    await core.bioDelete().catch(() => {
    });
  }
  await deleteItemAsync(PEPPER_NAME).catch(() => {
  });
  await deleteItemAsync(BIO_NAME, { requireAuthentication: true }).catch(() => {
  });
  persist.delete(AT);
}

// src/lib/vault.ts
void checkVaultCore();
var LEGACY_ID = "vault";
var KEY_NAME = "memoairem_vault_key";
var META = "vault_v3";
var FAILS = "vault_pin_fails";
var MARKER = "vault_created";
var CANARY_KEY = "canary";
var CANARY = "memoairem-private-v1";
var ITEMS = "items";
var ITEMS_MAC = "items_mac";
var BACKUP_KEY = "backup_key";
var IMG = (id) => `img:${id}`;
var IMG_MAC = (id) => `imgmac:${id}`;
var AAD_PIN = "memoairem v3 pin";
var AAD_REC = "memoairem v3 recovery";
var open = null;
var openKey = null;
var tampered = false;
var opened = /* @__PURE__ */ new Map();
var currentId = null;
function readEntry(raw) {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    if (j && typeof j.k === "string" && typeof j.id === "string" && /^vault-[A-Za-z0-9_-]{8,}$/.test(j.id)) {
      return { id: j.id, k: j.k };
    }
  } catch {
  }
  return { id: LEGACY_ID, k: raw };
}
function readMeta() {
  const raw = persist.getString(META);
  if (!raw) return null;
  try {
    const m = JSON.parse(raw);
    return m && m.v === 3 && typeof m.id === "string" && m.pin && m.rec ? m : null;
  } catch {
    return null;
  }
}
function writeMeta(m) {
  persist.set(META, JSON.stringify(m));
}
var ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function randomChars(n) {
  const b = getRandomBytes(n);
  let s = "";
  for (let i = 0; i < n; i++) s += ALPHABET[b[i] & 63];
  return s;
}
function newKey() {
  return randomChars(32);
}
var iv12 = () => getRandomBytes(12);
function vaultMode() {
  if (readMeta()) return "v3";
  return persist.getString(MARKER) === "1" ? "legacy" : "none";
}
async function strongBiometricReady() {
  try {
    const level = await getEnrolledLevelAsync();
    return level === SecurityLevel.BIOMETRIC_STRONG;
  } catch {
    return false;
  }
}
var KC_LABEL = "memoairem-folder-key-check";
var keyCheck = (k) => mac(macKey(k), KC_LABEL);
var openCore = null;
var createdInKotlin = false;
function openMmkv(entry) {
  const before = opened.get(entry.id);
  if (before !== void 0 && before !== entry.k) {
    return { ok: false, reason: "error", message: "Close and reopen MemoAirem, then unlock again." };
  }
  const db2 = createMMKV({ id: entry.id, encryptionKey: entry.k, encryptionType: "AES-256" });
  opened.set(entry.id, entry.k);
  return db2;
}
var isMmkv = (x) => !("ok" in x);
async function openWith(entry, created) {
  const meta2 = readMeta();
  const mine = !!meta2 && meta2.id === entry.id;
  if (!created && mine && meta2.kc && meta2.kc !== keyCheck(entry.k)) {
    console.log("[private] a folder key that does not match was refused before opening");
    return { ok: false, reason: "error", message: "That didn\u2019t open the private folder. Use your PIN or recovery key." };
  }
  const unreadable = {
    ok: false,
    reason: "key-lost",
    message: entry.id === LEGACY_ID ? "This private folder was damaged by a bug in MemoAirem 1.10.0\u20131.10.10 (fixed now) and can\u2019t be read. Delete it and start a new one \u2014 the new folder won\u2019t have this problem." : "The private folder couldn\u2019t be read with this key. Nothing was changed."
  };
  const where2 = mine ? meta2.store : void 0;
  const core = await storeCore();
  let db2 = null;
  if (!created && (where2 === "kotlin" || where2 === "kotlin-new")) {
    if (!core) {
      return {
        ok: false,
        reason: "error",
        message: "Your private folder was moved to MemoAirem\u2019s newer storage, which this version can\u2019t open. Install the latest MemoAirem \u2014 nothing is lost."
      };
    }
    let fine = false;
    try {
      core.storeOpen(entry.id, entry.k);
      fine = core.storeGet(CANARY_KEY) === CANARY;
    } catch (e) {
      console.log("[private] storage: Kotlin store could not be read:", String(e?.message ?? e));
    }
    if (fine && where2 === "kotlin-new") {
      try {
        deleteMMKV(entry.id);
      } catch {
      }
      opened.delete(entry.id);
      writeMeta({ ...readMeta(), store: "kotlin" });
      console.log("[private] storage: folder now fully in the Kotlin core (old copy removed)");
    }
    if (fine) {
      db2 = kotlinDb(core);
      openCore = core;
    } else if (where2 === "kotlin-new") {
      console.log("[private] storage: using the old copy; the Kotlin store will be checked again");
      try {
        core.storeClose();
        core.storeDelete(entry.id);
      } catch {
      }
      writeMeta({ ...readMeta(), store: void 0 });
    } else {
      return unreadable;
    }
  }
  if (!db2) {
    if (created && core) {
      try {
        core.storeOpen(entry.id, entry.k);
        core.storeSet(CANARY_KEY, CANARY);
        if (core.storeGet(CANARY_KEY) === CANARY) {
          db2 = kotlinDb(core);
          openCore = core;
          createdInKotlin = true;
          console.log("[private] storage: new folder made in the Kotlin core");
        }
      } catch (e) {
        console.log("[private] storage: Kotlin store unavailable for the new folder:", String(e?.message ?? e));
      }
    }
  }
  if (!db2) {
    const m = openMmkv(entry);
    if (!isMmkv(m)) return m;
    if (created) {
      m.set(CANARY_KEY, CANARY);
      createdInKotlin = false;
    } else if (m.getString(CANARY_KEY) !== CANARY) {
      return unreadable;
    }
    db2 = m;
    const cur = readMeta();
    if (!created && core && cur && cur.id === entry.id && !cur.store) {
      try {
        core.storeOpen(entry.id, entry.k);
        const kdb = kotlinDb(core);
        const r = copyAll(m, kdb);
        if (r.ok) {
          writeMeta({ ...readMeta(), store: "kotlin-new" });
          db2 = dualDb(kdb, m);
          openCore = core;
          console.log(`[private] storage: ${r.count} entries copied to the Kotlin core and read back \u2014 old copy kept until the next start`);
        } else {
          console.log("[private] storage: not moved \u2014", r.why);
          core.storeClose();
          core.storeDelete(entry.id);
        }
      } catch (e) {
        console.log("[private] storage: not moved \u2014", String(e?.message ?? e));
      }
    }
  }
  open = db2;
  openKey = entry.k;
  currentId = entry.id;
  const m2 = readMeta();
  if (m2 && m2.id === entry.id && !m2.kc) writeMeta({ ...m2, kc: keyCheck(entry.k) });
  const raw = db2.getString(ITEMS);
  const tag = db2.getString(ITEMS_MAC);
  tampered = !!(raw && tag && tag !== mac(macKey(entry.k), raw));
  if (raw && !tag) db2.set(ITEMS_MAC, mac(macKey(entry.k), raw));
  return tampered ? { ok: true, created, tampered: true } : { ok: true, created };
}
function readFails() {
  try {
    const j = JSON.parse(persist.getString(FAILS) ?? "");
    return { n: Number(j.n) || 0, until: Number(j.until) || 0 };
  } catch {
    return { n: 0, until: 0 };
  }
}
function pinWaitSeconds(now = Date.now()) {
  const f = readFails();
  return f.until > now ? Math.ceil((f.until - now) / 1e3) : 0;
}
async function getPepper2(create) {
  const p = await getPepper();
  if (p || !create) return p;
  const fresh = bytesToHex(getRandomBytes(32));
  await setPepper(fresh);
  return fresh;
}
async function tryPin(pin) {
  const m = readMeta();
  if (!m) return { ok: false, reason: "setup", message: "Set up your private folder first." };
  const wait = pinWaitSeconds();
  if (wait > 0) return { ok: false, reason: "wait", waitSeconds: wait, message: `Too many wrong PINs. Try again in ${showWait(wait)}.` };
  if (!isValidPin(pin)) return { ok: false, reason: "wrong-pin", message: "Enter your 6-digit PIN." };
  const pepper = await getPepper2(false);
  if (!pepper) {
    return {
      ok: false,
      reason: "key-lost",
      message: "This phone\u2019s security keys were reset, so the PIN can\u2019t open the folder. Use your recovery key."
    };
  }
  try {
    await checkVaultCore();
    const t0 = Date.now();
    const key = await pinKey(pin, m.salt, pepper, m.n);
    console.log(`[private] PIN check ${Date.now() - t0} ms (${vaultEngine()})`);
    const k = unsealText(key, m.pin, AAD_PIN);
    persist.delete(FAILS);
    return { k };
  } catch {
    const f = readFails();
    const n = f.n + 1;
    const pause = pinPause(n);
    persist.set(FAILS, JSON.stringify({ n, until: pause ? Date.now() + pause * 1e3 : 0 }));
    return {
      ok: false,
      reason: "wrong-pin",
      waitSeconds: pause || void 0,
      message: pause ? `Wrong PIN. Try again in ${showWait(pause)}.` : `Wrong PIN. ${5 - n > 0 ? `${5 - n} more before a pause.` : ""}`.trim()
    };
  }
}
async function unlockWithPin(pin) {
  const m = readMeta();
  const r = await tryPin(pin);
  if (!("k" in r)) return r;
  cleanupLegacy();
  return await openWith({ id: m.id, k: r.k }, false);
}
async function unlockWithRecovery(typed) {
  const m = readMeta();
  if (!m) return { ok: false, reason: "setup", message: "Set up your private folder first." };
  const code = normalizeRecoveryKey(typed);
  if (!code) return { ok: false, reason: "wrong-key", message: "A recovery key is 25 letters and numbers, like ABCDE-12345-\u2026" };
  try {
    const k = unsealText(recoveryWrapKey(code), m.rec, AAD_REC);
    persist.delete(FAILS);
    return await openWith({ id: m.id, k }, false);
  } catch {
    return { ok: false, reason: "wrong-key", message: "That recovery key doesn\u2019t open this folder. Check each character." };
  }
}
function showWait(s) {
  return s < 60 ? `${s} seconds` : s < 3600 ? `${Math.ceil(s / 60)} minutes` : "1 hour";
}
function cleanupLegacy() {
  void deleteItemAsync(KEY_NAME).catch(() => {
  });
}
function lockVault() {
  open = null;
  try {
    openCore?.storeClose?.();
  } catch {
  }
  openCore = null;
  openKey = null;
  tampered = false;
}
function db() {
  if (!open) throw new Error("Private folder is locked");
  return open;
}
var pending = null;
function beginSetup(pin, opts = {}) {
  if (!isValidPin(pin)) throw new Error("PIN must be 6 digits");
  const reuse = opts.recoveryKey ? normalizeRecoveryKey(opts.recoveryKey) : null;
  const code = reuse ?? normalizeRecoveryKey(makeRecoveryKey(getRandomBytes(25)));
  pending = { pin, code, restore: opts.restore ?? null };
  return formatRecoveryKey(code);
}
async function finishSetup(opts) {
  if (!pending) return { ok: false, reason: "error", message: "Setup was interrupted \u2014 start again." };
  const p = pending;
  try {
    let entry;
    let created = false;
    if (open && openKey && currentId && vaultMode() === "legacy") {
      entry = { id: currentId, k: openKey };
    } else {
      if (vaultMode() !== "none") return { ok: false, reason: "error", message: "A private folder already exists." };
      entry = { id: `vault-${randomChars(12)}`, k: newKey() };
      created = true;
    }
    const pepper = bytesToHex(getRandomBytes(32));
    await setPepper(pepper);
    const salt = bytesToHex(getRandomBytes(16));
    await checkVaultCore();
    const pk = await pinKey(p.pin, salt, pepper, PIN_SCRYPT_N);
    const meta2 = {
      v: 3,
      id: entry.id,
      n: PIN_SCRYPT_N,
      salt,
      pin: sealText(pk, iv12(), entry.k, AAD_PIN),
      rec: sealText(recoveryWrapKey(p.code), iv12(), entry.k, AAD_REC),
      bio: false,
      created: (/* @__PURE__ */ new Date()).toISOString(),
      kc: keyCheck(entry.k)
    };
    if (created) {
      const r = await openWith(entry, true);
      if (!r.ok) return r;
      if (createdInKotlin) meta2.store = "kotlin";
    }
    db().set(BACKUP_KEY, bytesToHex(backupKey(p.code)));
    let restored;
    if (p.restore) restored = mergeItems(p.restore);
    writeMeta(meta2);
    persist.set(MARKER, "1");
    persist.delete(FAILS);
    await deleteItemAsync(KEY_NAME).catch(() => {
    });
    pending = null;
    if (opts.biometric) await enableBiometric().catch(() => false);
    return { ok: true, created, restored };
  } catch (e) {
    return { ok: false, reason: "error", message: "Could not finish setting up: " + String(e?.message ?? e) };
  }
}
function needOpen() {
  const m = readMeta();
  if (!open || !openKey || !m) throw new Error("Private folder is locked");
  return { m, k: openKey };
}
async function enableBiometric() {
  const { m, k } = needOpen();
  if (!await strongBiometricReady()) return false;
  const made = await bioSave(k);
  writeMeta({ ...needOpen().m, bio: made });
  return made;
}
var pendingRotate = null;
function listPrivate() {
  const raw = db().getString(ITEMS);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function writeItems(items) {
  const raw = JSON.stringify(items);
  db().set(ITEMS, raw);
  if (openKey) db().set(ITEMS_MAC, mac(macKey(openKey), raw));
}
function newId(prefix) {
  return `${prefix}${Date.now().toString(36)}${randomChars(9)}`;
}
var PRIVATE_NOTE_TYPE = "private-note";
function isPrivateNote(r) {
  return r.type === PRIVATE_NOTE_TYPE;
}
function isPrivateDoc(r) {
  return r.type === PRIVATE_DOC_TYPE;
}
function kindOf(r) {
  return !r ? "password" : isPrivateDoc(r) ? "doc" : isPrivateNote(r) ? "note" : "password";
}
function putPhoto(imageId, base64) {
  db().set(IMG(imageId), base64);
  if (openKey) db().set(IMG_MAC(imageId), mac(macKey(openKey), base64));
}
function dropPhoto(imageId) {
  db().remove(IMG(imageId));
  db().remove(IMG_MAC(imageId));
}
function savePrivate(input, editingId) {
  const items = listPrivate();
  const prior = editingId ? items.find((r) => r.id === editingId) : void 0;
  const kind = input.kind ?? kindOf(prior);
  const title = input.title.trim();
  const doc = kind === "doc" ? input.doc ?? { no: "", issued: null, expires: null, place: "", notes: "" } : null;
  const username = doc ? doc.no.trim() : kind === "note" ? "" : input.username.trim();
  const notes = doc ? packDocNotes(doc.issued, doc.notes) ?? "" : (kind === "note" ? input.content ?? "" : input.password).trim();
  const place = doc ? doc.place.trim() : kind === "password" ? normalizeSite(input.site) ?? "" : "";
  if (!title && !username && !notes && !place && !doc?.expires && !input.photo) return null;
  let imageId = prior?.imageId ?? null;
  let thumb = prior?.thumb ?? null;
  if ((input.removePhoto || input.photo) && imageId) {
    dropPhoto(imageId);
    imageId = null;
    thumb = null;
  }
  if (input.photo) {
    imageId = newId("pi");
    putPhoto(imageId, input.photo.base64);
    thumb = input.photo.thumb;
  }
  const rec = {
    id: prior?.id ?? newId("p"),
    type: kind === "doc" ? PRIVATE_DOC_TYPE : kind === "note" ? PRIVATE_NOTE_TYPE : "private",
    // Never fall back to the note for a title: titles are shown in lists and SPOKEN by password
    // search, the note may be the password or ID number itself (1.10.2).
    title: (title || (input.photo || prior?.imageId ? "Photo" : kind === "doc" ? "Document" : kind === "note" ? "Private note" : "Private item")).slice(0, 200),
    date: doc?.expires ?? null,
    // documents: the EXPIRY date (sorting + the in-folder warning)
    time: null,
    location: place || null,
    // documents: place of issue
    people: username || null,
    notes: notes || null,
    via: "private",
    imageId,
    thumb
  };
  writeItems(prior ? items.map((r) => r.id === rec.id ? rec : r) : [rec, ...items]);
  return rec;
}
function privatePhoto(imageId) {
  if (!imageId) return null;
  const b = db().getString(IMG(imageId));
  if (!b) return null;
  const tag = db().getString(IMG_MAC(imageId));
  if (openKey) {
    if (!tag) putPhoto(imageId, b);
    else if (tag !== mac(macKey(openKey), b)) return null;
  }
  return "data:image/jpeg;base64," + b;
}
function exportBackup(owner) {
  needOpen();
  const keyHex = db().getString(BACKUP_KEY);
  if (!keyHex) throw new Error("No backup key \u2014 make a new recovery key first.");
  const items = listPrivate();
  const imgs = {};
  for (const r of items) {
    if (r.imageId) {
      const b = db().getString(IMG(r.imageId));
      if (b) imgs[r.imageId] = b;
    }
  }
  const header = { app: "MemoAirem", v: 1, created: (/* @__PURE__ */ new Date()).toISOString(), owner };
  return packBackup(hexToBytes(keyHex), iv12(), header, JSON.stringify({ items, imgs }));
}
function readBackup(text, typedKey) {
  const code = normalizeRecoveryKey(typedKey);
  if (!code) return { ok: false, message: "A recovery key is 25 letters and numbers, like ABCDE-12345-\u2026" };
  const r = openBackup(backupKey(code), text);
  if (!r.ok) {
    return {
      ok: false,
      message: r.reason === "not-a-backup" ? "That file isn\u2019t a MemoAirem private backup." : "That recovery key doesn\u2019t open this backup."
    };
  }
  try {
    const p = JSON.parse(r.payload);
    if (!Array.isArray(p.items)) throw new Error("bad");
    return { ok: true, payload: { items: p.items, imgs: p.imgs ?? {} }, header: r.header };
  } catch {
    return { ok: false, message: "That backup is damaged." };
  }
}
function mergeItems(p) {
  const items = listPrivate();
  const have = new Set(items.map((r) => r.id));
  const add = [];
  for (const r of p.items) {
    if (!r || typeof r.id !== "string" || have.has(r.id)) continue;
    const photo = r.imageId ? p.imgs[r.imageId] : void 0;
    if (r.imageId && photo) putPhoto(r.imageId, photo);
    add.push({ ...r, via: "private", imageId: r.imageId && photo ? r.imageId : null });
  }
  if (add.length) writeItems([...add, ...items]);
  return add.length;
}
async function deleteVault() {
  lockVault();
  pending = null;
  pendingRotate = null;
  let entry = null;
  try {
    entry = readEntry(await getItemAsync(KEY_NAME));
  } catch {
    entry = null;
  }
  const ids = /* @__PURE__ */ new Set([LEGACY_ID]);
  if (entry) ids.add(entry.id);
  const m = readMeta();
  if (m) ids.add(m.id);
  if (currentId) ids.add(currentId);
  const core = await storeCore();
  for (const id of ids) {
    try {
      deleteMMKV(id);
    } catch {
    }
    opened.delete(id);
    try {
      core?.storeDelete?.(id);
    } catch {
    }
  }
  currentId = null;
  await deleteItemAsync(KEY_NAME).catch(() => {
  });
  await deleteAllKeys();
  persist.delete(META);
  persist.delete(FAILS);
  persist.delete(MARKER);
}

// scripts/vault-sim/mocks/kotlincore.ts
function makeCore(version = 2) {
  const ctl2 = {
    secrets: /* @__PURE__ */ new Map(),
    bio: null,
    cancel: false,
    // the person closes the prompt
    invalidated: false,
    // a fingerprint was added → the key is gone
    available: true,
    // a strong fingerprint is enrolled
    lieOnReadBack: false,
    // secretGet returns something else
    failSave: false,
    // bioSave fails with an unexpected error
    touches: 0,
    // v3 storage: folders on "disk" — id → { k, entries }; survives restarts like real files
    folders: /* @__PURE__ */ new Map(),
    storeLie: false,
    // reads back something else
    storeBroken: false
    // every read throws (damage / a bug)
  };
  const err = (code) => Object.assign(new Error(code), { code });
  const touch = () => {
    ctl2.touches++;
    if (ctl2.cancel) throw err("ERR_CANCELLED");
  };
  const mod = {
    coreVersion: () => version,
    scryptHex: async (pw, salt, n, r, p, dk) => Buffer.from(scrypt(Buffer.from(pw, "hex"), Buffer.from(salt, "hex"), { N: n, r, p, dkLen: dk })).toString("hex")
  };
  if (version >= 2) {
    Object.assign(mod, {
      secretPut: async (name, v) => {
        ctl2.secrets.set(name, v);
      },
      secretGet: async (name) => ctl2.lieOnReadBack ? "ff".repeat(32) : ctl2.secrets.get(name) ?? null,
      secretDelete: async (name) => {
        ctl2.secrets.delete(name);
      },
      bioAvailable: () => ctl2.available,
      bioSaved: () => ctl2.bio !== null,
      bioSave: async (v) => {
        if (!ctl2.available) throw err("ERR_UNAVAILABLE");
        if (ctl2.failSave) throw err("ERR_BIO");
        touch();
        ctl2.bio = v;
        ctl2.invalidated = false;
        return true;
      },
      bioOpen: async () => {
        if (ctl2.bio === null) throw err("ERR_NONE");
        if (ctl2.invalidated) {
          ctl2.bio = null;
          throw err("ERR_INVALIDATED");
        }
        touch();
        return ctl2.bio;
      },
      bioDelete: async () => {
        ctl2.bio = null;
      }
    });
  }
  if (version >= 3) {
    let cur = null;
    const folder = () => {
      if (!cur) throw new Error("Private folder storage is not open");
      const f = ctl2.folders.get(cur.id);
      return f;
    };
    Object.assign(mod, {
      storeExists: (id) => (ctl2.folders.get(id)?.entries.size ?? 0) > 0,
      storeOpen: (id, k) => {
        if (!/^vault(-[A-Za-z0-9_-]{8,})?$/.test(id)) throw new Error("bad folder id");
        cur = { id, k };
        return (ctl2.folders.get(id)?.entries.size ?? 0) > 0;
      },
      storeGet: (name) => {
        const f = folder();
        if (!f || !f.entries.has(name)) return null;
        if (ctl2.storeBroken) throw new Error("AEADBadTagException");
        if (f.k !== cur.k) throw new Error("AEADBadTagException");
        return ctl2.storeLie ? f.entries.get(name) + "x" : f.entries.get(name);
      },
      storeSet: (name, v) => {
        let f = folder();
        if (!f) {
          f = { k: cur.k, entries: /* @__PURE__ */ new Map() };
          ctl2.folders.set(cur.id, f);
        }
        if (f.k !== cur.k) throw new Error("written with another key");
        f.entries.set(name, v);
      },
      storeRemove: (name) => {
        folder()?.entries.delete(name);
      },
      storeKeys: () => [...folder()?.entries.keys() ?? []].sort(),
      storeClose: () => {
        cur = null;
      },
      storeDelete: (id) => {
        if (cur?.id === id) cur = null;
        ctl2.folders.delete(id);
        return true;
      }
    });
  }
  return { mod, ctl: ctl2 };
}

// scripts/vault-sim/store-sim.ts
var ok = (c, m) => {
  console.log(c ? "\u2713" : "\u2717", m);
  if (!c) process.exitCode = 1;
};
var PIN = "482916";
async function boot(mod) {
  lockVault();
  restartApp();
  resetVaultCoreForTests();
  nativeCtl.mod = mod;
  await checkVaultCore();
}
var newPhone = () => {
  restartApp();
  for (const k of persist.getAllKeys()) persist.delete(k);
  disk.clear();
  clearAll();
};
var meta = () => JSON.parse(persist.getString("vault_v3") ?? "{}");
var titles = () => listPrivate().map((r) => r.title).sort().join(",");
(async () => {
  console.log("\u2014 a folder in MMKV (builds 83\u201388) moves to the Kotlin store \u2014");
  newPhone();
  await boot(null);
  beginSetup(PIN);
  await finishSetup({ biometric: false });
  savePrivate({ title: "Gmail", username: "ede", password: "pw1" });
  const ph = savePrivate({ title: "Passport scan", username: "", password: "P1", photo: { base64: "UEFTUw==", thumb: "data:,p" } });
  const id = meta().id;
  ok(!meta().store && disk.has(id), "made without the Kotlin store: in MMKV");
  const before = [...disk.get(id).data.entries()].sort();
  const core = makeCore(3);
  await boot(core.mod);
  let r = await unlockWithPin(PIN);
  ok(r.ok && titles() === "Gmail,Passport scan", "opens as before");
  const kf = core.ctl.folders.get(id);
  ok(meta().store === "kotlin-new" && kf && [...kf.entries.entries()].sort().join("|") === before.join("|"), "EVERY entry copied to Kotlin and read back (incl. the photo, MAC, canary, backup key)");
  ok(disk.has(id), "old MMKV copy kept for now");
  savePrivate({ title: "Bank", username: "ede", password: "1234" });
  ok(kf.entries.get("items").includes("Bank") && disk.get(id).data.get("items").includes("Bank"), "while moving, a new item is written to BOTH");
  await boot(core.mod);
  r = await unlockWithPin(PIN);
  ok(r.ok && meta().store === "kotlin" && !disk.has(id), "next start: Kotlin store opens the folder \u2192 promoted, old MMKV copy removed");
  ok(titles() === "Bank,Gmail,Passport scan" && privatePhoto(ph.imageId) === "data:image/jpeg;base64,UEFTUw==", "all items and the photo read from Kotlin");
  savePrivate({ title: "Wifi", username: "", password: "w" });
  lockVault();
  await boot(core.mod);
  await unlockWithPin(PIN);
  ok(titles() === "Bank,Gmail,Passport scan,Wifi" && !disk.has(id), "saves persist in Kotlin across restarts; MMKV not recreated");
  const bk = exportBackup(null);
  ok(bk.length > 100, "backup file still made from the Kotlin store");
  console.log("\u2014 tamper check + key check still work on the Kotlin store \u2014");
  lockVault();
  const it = kf.entries.get("items");
  kf.entries.set("items", it.replace("Gmail", "Gma1l"));
  await boot(core.mod);
  r = await unlockWithPin(PIN);
  ok(r.ok && r.tampered === true, "changed items detected");
  kf.entries.set("items", it);
  lockVault();
  await boot(core.mod);
  r = await unlockWithPin(PIN);
  ok(r.ok && !r.tampered, "restored \u2192 no warning");
  console.log("\u2014 nothing moves when Kotlin can't be trusted \u2014");
  newPhone();
  await boot(null);
  beginSetup(PIN);
  await finishSetup({ biometric: false });
  savePrivate({ title: "A", username: "", password: "a" });
  const id2 = meta().id;
  const liar = makeCore(3);
  liar.ctl.storeLie = true;
  await boot(liar.mod);
  r = await unlockWithPin(PIN);
  ok(r.ok && !meta().store && !liar.ctl.folders.has(id2) && disk.has(id2), "read-back differs \u2192 not moved, partial copy deleted, MMKV untouched");
  ok(titles() === "A", "folder works from MMKV");
  const v2 = makeCore(2);
  v2.ctl.secrets = liar.ctl.secrets;
  await boot(v2.mod);
  r = await unlockWithPin(PIN);
  ok(r.ok && !meta().store, "a v2 core (build 88) \u2192 stays in MMKV");
  console.log("\u2014 the Kotlin store fails during the move \u2192 back to the (current) old copy \u2014");
  const c3 = makeCore(3);
  c3.ctl.secrets = liar.ctl.secrets;
  await boot(c3.mod);
  await unlockWithPin(PIN);
  ok(meta().store === "kotlin-new", "copied");
  savePrivate({ title: "B", username: "", password: "b" });
  c3.ctl.storeBroken = true;
  await boot(c3.mod);
  r = await unlockWithPin(PIN);
  ok(r.ok && !meta().store && titles() === "A,B" && disk.has(meta().id), "Kotlin store unreadable \u2192 opens from the old copy, nothing lost (incl. the item saved while moving)");
  c3.ctl.storeBroken = false;
  await boot(c3.mod);
  r = await unlockWithPin(PIN);
  ok(r.ok && meta().store === "kotlin-new", "next start tries the move again");
  await boot(c3.mod);
  r = await unlockWithPin(PIN);
  ok(r.ok && meta().store === "kotlin" && titles() === "A,B", "\u2026 and completes");
  console.log("\u2014 after the move \u2014");
  c3.ctl.storeBroken = true;
  await boot(c3.mod);
  r = await unlockWithPin(PIN);
  ok(!r.ok && r.reason === "key-lost" && c3.ctl.folders.has(meta().id), "Kotlin store damaged \u2192 refused, nothing deleted (the backup file is the way back)");
  c3.ctl.storeBroken = false;
  await boot(null);
  r = await unlockWithPin(PIN);
  ok(!r.ok && /Install the latest MemoAirem/.test(r.message), 'an older build \u2192 "install the latest", nothing changed');
  await boot(c3.mod);
  ok((await unlockWithPin(PIN)).ok, "the right build opens it again");
  await deleteVault();
  ok(c3.ctl.folders.size === 0 && !persist.getString("vault_v3"), "Delete private folder \u2192 the Kotlin store is deleted too");
  console.log("\u2014 new folders and restores start in Kotlin \u2014");
  newPhone();
  const c4 = makeCore(3);
  await boot(c4.mod);
  const code = beginSetup(PIN);
  await finishSetup({ biometric: false });
  ok(meta().store === "kotlin" && !disk.has(meta().id) && c4.ctl.folders.has(meta().id), "a new folder is made in the Kotlin store, no MMKV file");
  savePrivate({ title: "C", username: "", password: "c" });
  const file = exportBackup({ name: "Ede", email: "" });
  await boot(c4.mod);
  ok((await unlockWithPin(PIN)).ok && titles() === "C", "reopens from Kotlin");
  newPhone();
  const c5 = makeCore(3);
  await boot(c5.mod);
  const rb = readBackup(file, code);
  beginSetup("905117", { recoveryKey: code, restore: rb.ok ? rb.payload : null });
  const fr = await finishSetup({ biometric: false });
  ok(fr.ok && fr.restored === 1 && meta().store === "kotlin" && titles() === "C", "restore on a new phone \u2192 straight into the Kotlin store");
  await boot(c5.mod);
  ok((await unlockWithRecovery(code)).ok && titles() === "C", "recovery key opens it");
})();
/*! Bundled license information:

@noble/ciphers/esm/utils.js:
  (*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) *)

@noble/hashes/esm/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
