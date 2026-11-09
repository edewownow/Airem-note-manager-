/**
 * Date/time + id helpers, ported from the prototype.
 * "Today" is computed at call time (not once at boot) so the app stays correct
 * across day boundaries during a long-lived Android session.
 */
import type { Rec } from '../types';

export const MON = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
export const WD = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

/** Unique id with a short prefix (e.g. "e", "img", "l"). */
export function id(prefix: string): string {
  return prefix + Date.now() + Math.random().toString(36).slice(2, 6);
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function iso(d: Date): string {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

/** Monday-based start of week (matches the prototype). */
export function startOfWeek(base: Date): Date {
  const x = new Date(base);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Today's prompt context for the parse system prompt. */
export interface TodayContext {
  todayISO: string;
  weekday: string;
  year: number;
}
export function todayContext(now: Date = new Date()): TodayContext {
  return { todayISO: iso(now), weekday: WD[now.getDay()], year: now.getFullYear() };
}

/* ---------------- spoken answers (TTS phrasing) ---------------- */
export function spokenTime(t: string | null): string {
  if (!t) return '';
  let [h, m] = t.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const hh = h % 12 || 12;
  return hh + (m ? ':' + String(m).padStart(2, '0') : '') + ' ' + ap;
}

// Spoken query replies live in lib/voice.ts (1.8.0).
