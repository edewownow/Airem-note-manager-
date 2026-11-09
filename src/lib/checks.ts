/**
 * Auto-check verdict — structural sanity only (valid JSON, count, missing title,
 * missing/odd dates). NOT an accuracy signal (corrections are). Ported verbatim
 * from the prototype's runChecks()/statusSummary().
 */
import type { Rec, Verdict } from '../types';

export function runChecks(parsed: Rec[], parsedOk: boolean): Verdict {
  if (!parsedOk) return { status: 'fail', notes: ['response was not valid JSON'] };
  const n = parsed.length;
  if (n === 0) return { status: 'fail', notes: ['no records extracted'] };

  const currentYear = new Date().getFullYear();
  const notes: string[] = [];
  let status: Verdict['status'] = 'ok';

  const noTitle = parsed.filter((r) => !r.title || r.title === 'Untitled').length;
  // A missing date is NORMAL now — most captures (menus, contacts, notes, photos)
  // are intentionally undated. Only a present-but-implausible date is suspicious.
  const badDate = parsed.filter((r) => {
    if (!r.date) return false;
    const y = +r.date.slice(0, 4);
    return y < 2000 || y > currentYear + 5;
  }).length;

  if (noTitle) {
    status = 'warn';
    notes.push(noTitle + ' missing a title');
  }
  if (badDate) {
    status = 'warn';
    notes.push(badDate + ' with an odd date');
  }
  if (!notes.length) notes.push('looks valid');
  return { status, notes };
}

export function statusSummary(c: Verdict, count: number): string {
  const icon = c.status === 'ok' ? '✓' : c.status === 'warn' ? '⚠' : '✕';
  return (
    icon +
    ' ' +
    (count ? count + ' item' + (count === 1 ? '' : 's') : 'nothing extracted') +
    ' · ' +
    c.notes.join(', ')
  );
}
