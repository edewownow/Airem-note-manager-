/**
 * 2.0.0-autofill.7 (phase 3, step 1): reading a password export — Google Password Manager first
 * ("name,url,username,password,note"), and the usual column names of other managers.
 *
 * The file is a CSV (RFC 4180): fields may be quoted, quotes doubled inside, commas and line breaks
 * inside quotes, \r\n or \n line ends, a UTF-8 BOM. A password is taken EXACTLY as written — spaces,
 * quotes, commas and all.
 *
 * Each row becomes one login: title (the name, else the site), site (lib/sites.ts normalizeSite: a
 * web address → its host; Google's app logins "android://…@com.bdo.app/" → "android:com.bdo.app" — the
 * prefix keeps a package name from ever looking like a website (bdo.app), and autofill matches it to
 * that exact app only), username, password. Pure — no React Native — tested in node.
 */
import { normalizeSite } from './sites';

export interface ImportedLogin {
  title: string;
  site: string | null;
  username: string;
  password: string;
  hasNote: boolean; // the file had a note for it (a password item has no place for notes — counted, not imported)
}

export interface CsvResult {
  ok: boolean;
  logins: ImportedLogin[];
  skippedNoPassword: number; // rows without a password
  message?: string; // why ok = false
}

/** RFC 4180 rows. Throws on an unterminated quote. */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field === '') {
      quoted = true;
      i++;
    } else if (c === ',') {
      row.push(field);
      field = '';
      i++;
    } else if (c === '\r' || c === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i += c === '\r' && s[i + 1] === '\n' ? 2 : 1;
    } else {
      field += c;
      i++;
    }
  }
  if (quoted) throw new Error('unterminated quote');
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

const COLS: Record<'title' | 'url' | 'username' | 'password' | 'note', string[]> = {
  title: ['name', 'title', 'account', 'login_name', 'item name'],
  url: ['url', 'login_uri', 'website', 'web site', 'uri', 'origin', 'login url', 'site'],
  username: ['username', 'login_username', 'user', 'login', 'email', 'user name', 'username/email'],
  password: ['password', 'login_password', 'pass'],
  note: ['note', 'notes', 'extra', 'comment', 'comments'],
};

/** Google's app logins: "android://<hash>@com.bdo.app/" → "com.bdo.app". */
function appPackage(url: string): string | null {
  const m = url.trim().match(/^android:\/\/(?:[^@/]*@)?([A-Za-z][\w]*(?:\.[\w]+)+)\/?$/);
  return m ? m[1] : null;
}

export function readPasswordCsv(text: string): CsvResult {
  let rows: string[][];
  try {
    rows = parseCsv(text);
  } catch {
    return { ok: false, logins: [], skippedNoPassword: 0, message: 'That file is damaged (a quote is never closed).' };
  }
  if (rows.length < 1) return { ok: false, logins: [], skippedNoPassword: 0, message: 'That file is empty.' };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (k: keyof typeof COLS) => head.findIndex((h) => COLS[k].includes(h));
  const ci = { title: col('title'), url: col('url'), username: col('username'), password: col('password'), note: col('note') };
  if (ci.password < 0) {
    return {
      ok: false,
      logins: [],
      skippedNoPassword: 0,
      message: 'That isn’t a password export — it has no “password” column. Export from Google Password Manager (Settings → Export passwords).',
    };
  }
  const logins: ImportedLogin[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const get = (i: number) => (i >= 0 && i < r.length ? r[i] : '');
    const password = get(ci.password); // EXACTLY as written
    if (!password) {
      skipped++;
      continue;
    }
    const url = get(ci.url).trim();
    const pkg = appPackage(url);
    const site = pkg ? `android:${pkg}` : normalizeSite(url);
    const title = get(ci.title).trim() || pkg || site || 'Login';
    logins.push({ title: title.slice(0, 200), site, username: get(ci.username).trim(), password, hasNote: !!get(ci.note).trim() });
  }
  return { ok: true, logins, skippedNoPassword: skipped };
}
