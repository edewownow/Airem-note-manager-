/**
 * 1.13.0 — the user's profile (the user's choice: name + e-mail, "profile only, stays on phone").
 * No account and no server: these two fields live in this phone's app storage, are shown in the app
 * (greeting, Settings) and written into the header of a private backup file so the user can tell
 * whose backup it is. Never sent anywhere — not to Gemini, not to Harbor.
 */
import { persist } from './persist';

export interface Profile {
  name: string;
  email: string;
}

const PROFILE = 'profile';
const ONBOARDED = 'onboarded'; // '1' once the first-run setup was finished or skipped

export function getProfile(): Profile | null {
  try {
    const j = JSON.parse(persist.getString(PROFILE) ?? '');
    if (j && typeof j.name === 'string') return { name: j.name, email: typeof j.email === 'string' ? j.email : '' };
  } catch {
    /* none yet */
  }
  return null;
}

export function saveProfile(p: Profile): void {
  persist.set(PROFILE, JSON.stringify({ name: p.name.trim().slice(0, 60), email: p.email.trim().slice(0, 120) }));
}

export function isOnboarded(): boolean {
  return persist.getString(ONBOARDED) === '1';
}

export function setOnboarded(): void {
  persist.set(ONBOARDED, '1');
}

/** Light check — the e-mail is only a label (nothing is sent to it). Empty is allowed. */
export function emailLooksRight(e: string): boolean {
  const t = e.trim();
  return !t || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t);
}

/** "Ede" from "Ede Vallejos" — for the greeting. */
export function firstName(p: Profile | null): string {
  return (p?.name ?? '').trim().split(/\s+/)[0] ?? '';
}
