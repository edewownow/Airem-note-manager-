/**
 * Password generator (1.10.5) — made ON THE PHONE from the secure random source (expo-crypto),
 * never sent anywhere. 16 characters by default: upper + lower case, digits and symbols, at least
 * one of each. Look-alikes (O/0, I/l/1) are left out so it can be read and typed by hand.
 * Unbiased: random bytes outside a whole multiple of the alphabet size are thrown away.
 */
import { getRandomBytes } from 'expo-crypto';

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGIT = '23456789';
const SYMBOL = '!@#$%&*-_=+?';
const ALL = UPPER + LOWER + DIGIT + SYMBOL;

/** One unbiased random index below `n` (n ≤ 256). */
function randomBelow(n: number): number {
  const limit = 256 - (256 % n);
  for (;;) {
    const b = getRandomBytes(16);
    for (let i = 0; i < b.length; i++) if (b[i] < limit) return b[i] % n;
  }
}

function pick(set: string): string {
  return set[randomBelow(set.length)];
}

export function generatePassword(length = 16): string {
  const n = Math.max(8, Math.min(64, length));
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT), pick(SYMBOL)];
  while (chars.length < n) chars.push(pick(ALL));
  // Fisher–Yates shuffle so the guaranteed four aren't always first
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
