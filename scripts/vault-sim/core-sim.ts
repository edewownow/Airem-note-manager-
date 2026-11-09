/**
 * The Kotlin vault core switch-over (2.0.0-autofill.2) — run after ANY change to lib/vaultNative.ts,
 * the scrypt hook in lib/vaultCrypto.ts, or VaultCrypto.kt. Needs scripts/kotlin-vault/run.sh first
 * (it compiles the REAL Kotlin core that "good Kotlin" below calls through the JVM).
 *
 *   scripts/kotlin-vault/run.sh && npx esbuild scripts/vault-sim/core-sim.ts --bundle --platform=node --outfile=scripts/vault-sim/.core.js \
 *     --alias:react-native-mmkv=./scripts/vault-sim/mocks/mmkv.ts --alias:expo-secure-store=./scripts/vault-sim/mocks/securestore.ts \
 *     --alias:expo-local-authentication=./scripts/vault-sim/mocks/localauth.ts --alias:expo-crypto=./scripts/vault-sim/mocks/crypto.ts \
 *     --alias:expo-image-manipulator=./scripts/vault-sim/mocks/empty.ts --alias:expo-file-system/legacy=./scripts/vault-sim/mocks/empty.ts \
 *     --alias:expo=./scripts/vault-sim/mocks/expo.ts && node scripts/vault-sim/.core.js
 */
import { execFileSync } from 'node:child_process';
import * as V from '../../src/lib/vault';
import { checkVaultCore, resetVaultCoreForTests, vaultEngine } from '../../src/lib/vaultNative';
import { restartApp } from './mocks/mmkv';
import { nativeCtl } from './mocks/expo';

const ok = (c: any, m: string) => { console.log(c ? '✓' : '✗', m); if (!c) process.exitCode = 1; };
const GL = process.env.GRADLE_LIB ?? '/opt/gradle/lib';
const KV = process.env.KOTLIN_VERSION ?? require('node:fs').readdirSync(GL).find((f: string) => /^kotlin-stdlib-[\d.]+\.jar$/.test(f))!.slice(14, -4);
let kotlinCalls = 0;
/** The REAL Kotlin vault core, run through the JVM. */
const realKotlin = {
  coreVersion: () => 1,
  scryptHex: async (pw: string, salt: string, n: number, r: number, p: number, dk: number) => {
    kotlinCalls++;
    return execFileSync('java', ['-cp', `scripts/kotlin-vault/.classes:${GL}/kotlin-stdlib-${KV}.jar`, 'ScryptCliKt', pw, salt, String(n), String(r), String(p), String(dk)], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  },
};
const liar = { coreVersion: () => 1, scryptHex: async () => '00'.repeat(32) };
let calls = 0;
const flaky = { coreVersion: () => 1, scryptHex: async (pw: string, salt: string, n: number, r: number, p: number, dk: number) => {
  calls++;
  if (calls === 1) return realKotlin.scryptHex(pw, salt, n, r, p, dk); // passes the self-check …
  throw new Error('native crash'); // … then breaks
} };

async function boot(mod: any) {
  V.lockVault(); restartApp(); resetVaultCoreForTests(); nativeCtl.mod = mod;
  await checkVaultCore();
}

(async () => {
  await boot(null);
  ok(vaultEngine() === 'js', 'a build without the Kotlin module → JS, as before');
  V.beginSetup('482916'); const s = await V.finishSetup({ biometric: false });
  ok(s.ok, 'folder set up with the JS core');
  V.savePrivate({ title: 'Gmail', username: 'ede', password: 'pw' }); V.lockVault();

  await boot(realKotlin);
  ok(vaultEngine() === 'kotlin' && kotlinCalls === 1, 'real Kotlin core passes the start-up self-check → switched on');
  let r: any = await V.unlockWithPin('482916');
  ok(r.ok && V.listPrivate()[0]?.title === 'Gmail', 'a folder made by JS opens with the Kotlin core');
  ok(kotlinCalls === 2, 'the PIN check really ran in Kotlin');
  await V.setPin('730519'); V.lockVault();
  ok(!(await V.unlockWithPin('482916')).ok, 'wrong (old) PIN refused by the Kotlin core');

  await boot(null);
  r = await V.unlockWithPin('730519');
  ok(r.ok && V.listPrivate().length === 1, 'a PIN set through Kotlin opens with plain JS (same bytes)');

  await boot(liar);
  ok(vaultEngine() === 'js', 'a core that gives different bytes is NOT used');
  r = await V.unlockWithPin('730519'); ok(r.ok, '… and the folder still opens (JS)');

  calls = 0; await boot(flaky);
  ok(vaultEngine() === 'kotlin', 'flaky core passes the self-check …');
  r = await V.unlockWithPin('730519');
  ok(r.ok && vaultEngine() === 'js', '… crashes on the PIN check → falls back to JS mid-check, folder opens');

  await boot(realKotlin);
  ok((await V.unlockWithPin('730519')).ok, 'reopened with the Kotlin core');
  await V.setSecretQuestion('Name of my first pet ever?', 'Bantay Ocean', 'Ede', '');
  V.lockVault(); await boot(null);
  ok((await V.unlockWithQuestion('Ede', '', 'bantay ocean')).ok, 'secret question set through Kotlin opens with JS');
  await V.deleteVault();
})();
