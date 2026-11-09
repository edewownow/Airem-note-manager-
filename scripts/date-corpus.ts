/**
 * Dates with a YEAR, and "in N years" (1.12.0-voice.27). Device question: "how is a date reminder for
 * next year and two years from now?" — the year used to be IGNORED. Expected dates are computed from
 * the day the test runs, so it stays valid. Run:
 *   npx esbuild scripts/date-corpus.ts --bundle --platform=node --outfile=scripts/.date.js --alias:react-native-mmkv=./scripts/vault-sim/mocks/mmkv.ts && node scripts/.date.js
 */
import { parseVoiceCommand, inferVoiceCommand } from '../src/lib/command';
import { parseWhen, interpret } from '../src/lib/query';
import { iso } from '../src/lib/datetime';

let bad = 0;
const ok = (c: boolean, m: string) => { console.log(c ? '✓' : '✗', m); if (!c) bad++; };
const today = new Date(); today.setHours(0, 0, 0, 0);
const Y = today.getFullYear();
const add = (n: number, unit: 'day' | 'month' | 'year') => { const d = new Date(today); if (unit === 'day') d.setDate(d.getDate() + n); else if (unit === 'month') d.setMonth(d.getMonth() + n); else d.setFullYear(d.getFullYear() + n); return iso(d); };

// SAVING — sentence → the date the reminder / event gets
const SAVES: [string, string][] = [
  ['remind me to renew my passport next year', add(1, 'year')],
  ['remind me to renew my passport in 2 years', add(2, 'year')],
  ['remind me to renew my passport in two years', add(2, 'year')],
  ['renew my driver license two years from now', add(2, 'year')],
  ['remind me to call mom in 10 days', add(10, 'day')],
  ['remind me to check the visa in 6 months', add(6, 'month')],
  ['remind me to renew my SIRB on March 5, 2028', '2028-03-05'],
  ['remind me to renew my SIRB on March 5 2027', '2027-03-05'],
  ['set schedule sign on in Miami on 3rd November 2027', '2027-11-03'],
  ['set schedule medical exam 15th of January 2030', '2030-01-15'],
  ['remind me to renew my contract on 5/3/2027', '2027-03-05'], // day first (user's choice)
  ['remind me to pay insurance on 25/12/2028', '2028-12-25'],
  ['remind me to pay insurance on 2027-03-05', '2027-03-05'],
  ['remind me to renew passport March 2028', '2028-03-01'],
  ['remind me to renew my visa in March next year', `${Y + 1}-03-01`],
  ['set schedule vacation next year in June', `${Y + 1}-06-01`],
  ['remind me to renew my SSS on the 5th of March next year', `${Y + 1}-03-05`],
];
for (const [s, want] of SAVES) {
  const c = parseVoiceCommand(s) ?? inferVoiceCommand(s);
  const got = parseWhen(c.fields.when || '').date;
  ok(got === want, `save ${JSON.stringify(s)} → ${got} (want ${want}) · title ${JSON.stringify(c.fields.what)}`);
}
// a year with no date cue is NOT a date
for (const s of ['set schedule room 2027 cleaning tomorrow at 9', 'note the 2027 Barolo is 90 dollars']) {
  const c = parseVoiceCommand(s) ?? inferVoiceCommand(s);
  ok(c.fields.what.includes('2027'), `"2027" stays in the title: ${JSON.stringify(s)} → ${JSON.stringify(c.fields.what)}`);
}
ok((parseVoiceCommand('set schedule sign on in Miami on 3rd November 2027')!.fields.what) === 'Sign on', '"sign on" keeps its "on"');

// ASKING — question → the window searched
const ASKS: [string, string, string][] = [
  ['what is next year', `${Y + 1}-01-01`, `${Y + 1}-12-31`],
  ['anything next year', `${Y + 1}-01-01`, `${Y + 1}-12-31`],
  ['what do I have in 2028', '2028-01-01', '2028-12-31'],
  ['what is in March 2028', '2028-03-01', '2028-03-31'],
  ['what is on March 5 2027', '2027-03-05', '2027-03-05'],
  ['what is in two years', add(2, 'year'), add(2, 'year')],
  ['what is on 5/3/2027', '2027-03-05', '2027-03-05'],
];
for (const [q, a, b] of ASKS) {
  const r = interpret(q).range;
  ok(!!r && r.start === a && r.end === b, `ask ${JSON.stringify(q)} → ${JSON.stringify(r)}`);
}
// unchanged behaviour
ok(interpret('what is on tomorrow').range?.start === add(1, 'day'), 'tomorrow unchanged');
ok(interpret('what is next week').label === 'next week', 'next week unchanged');
process.exit(bad ? 1 : 0);
