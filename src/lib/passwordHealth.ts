/**
 * 2.0.0-autofill.8 (phase 3): password health — which saved passwords are WEAK and which are REUSED.
 * Runs on the phone, on the open folder only; returns item ids and reasons — never a password.
 * Pure (no React Native) — tested in node (scripts/vault-sim/health-sim.ts).
 */
export interface HealthLogin {
  id: string;
  title: string;
  username: string;
  password: string;
}

export type WeakReason = 'short' | 'common' | 'digits' | 'username' | 'pattern';

export interface HealthIssue {
  id: string;
  title: string;
  weak: WeakReason | null;
  reusedWith: string[]; // titles of the other logins with the same password
}

const COMMON = new Set(
  (
    '123456 1234567 12345678 123456789 1234567890 password password1 password123 qwerty qwerty123 qwertyuiop abc123 ' +
    '111111 000000 123123 654321 666666 121212 iloveyou admin admin123 welcome welcome1 letmein monkey dragon ' +
    'sunshine princess football baseball shadow master superman batman trustno1 passw0rd p@ssw0rd p@ssword ' +
    'login starwars freedom whatever charlie michael jordan23 hello123 zaq12wsx 1q2w3e4r 1qaz2wsx asdfghjkl ' +
    'mahalkita iloveu iloveyou1 pakistan123 india123 manila 12qwaszx'
  ).split(' '),
);

/** A run like "abcd", "4321", "aaaa", or a keyboard row; the whole password is just that. */
function isPattern(p: string): boolean {
  const s = p.toLowerCase();
  if (s.length < 4) return false;
  if (/^(.)\1+$/.test(s)) return true;
  if (/^(..?.?)\1+$/.test(s)) return true; // abab, abcabc
  let up = true;
  let down = true;
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
    if (d !== 1) up = false;
    if (d !== -1) down = false;
  }
  if (up || down) return true;
  const rows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890'];
  return rows.some((r) => r.includes(s) || r.split('').reverse().join('').includes(s));
}

export function weakReason(password: string, username = ''): WeakReason | null {
  const p = password;
  const lower = p.toLowerCase();
  if (COMMON.has(lower) || COMMON.has(lower.replace(/[!.]+$/, ''))) return 'common';
  const u = username.trim().toLowerCase();
  const local = u.split('@')[0];
  if (u && (lower === u || (local.length >= 3 && lower.replace(/\d+$/, '') === local))) return 'username';
  if (isPattern(p)) return 'pattern';
  if (/^\d+$/.test(p) && p.length < 12) return 'digits';
  if (p.length < 8) return 'short';
  return null;
}

export const WEAK_TEXT: Record<WeakReason, string> = {
  short: 'shorter than 8 characters',
  common: 'a very common password',
  digits: 'only numbers',
  username: 'the same as the username',
  pattern: 'an easy pattern',
};

/** Only logins that need attention, weakest first. */
export function passwordHealth(list: HealthLogin[]): HealthIssue[] {
  const byPw = new Map<string, HealthLogin[]>();
  for (const l of list) {
    if (!l.password) continue;
    const g = byPw.get(l.password) ?? [];
    g.push(l);
    byPw.set(l.password, g);
  }
  const out: HealthIssue[] = [];
  for (const l of list) {
    if (!l.password) continue;
    const weak = weakReason(l.password, l.username);
    const reusedWith = (byPw.get(l.password) ?? []).filter((o) => o.id !== l.id).map((o) => o.title || 'Login');
    if (weak || reusedWith.length) out.push({ id: l.id, title: l.title || 'Login', weak, reusedWith });
  }
  return out.sort((a, b) => Number(!!b.weak) - Number(!!a.weak) || b.reusedWith.length - a.reusedWith.length || a.title.localeCompare(b.title));
}
