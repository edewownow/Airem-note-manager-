import { randomBytes } from 'node:crypto';
export function getRandomBytes(n: number) { return new Uint8Array(randomBytes(n)); }
