/**
 * feat/airem-forms: word forms (number words, endings, phrases) and what must NOT match. Run:
 *   npx esbuild scripts/forms-sim.ts --bundle --platform=node --outfile=scripts/.fo.js --alias:react-native-mmkv=./scripts/vault-sim/mocks/mmkv.ts --alias:expo=./scripts/vault-sim/mocks/expo.ts && node scripts/.fo.js
 */
import { localEngine } from '../src/lib/query';
import type { Rec } from '../src/types';

const R = (title: string, o: Partial<Rec> = {}): Rec => ({
  id: 'x' + Math.random().toString(36).slice(2), type: 'note', title, date: null, time: null,
  location: null, people: null, notes: null, via: 'typed', imageId: null, thumb: null, ...o,
});
const recs = [
  R('There are two chicken on the fridge'),
  R('My 3 keys are in the drawer'),
  R('Maria cooks dinner on deck 5'),
  R('Pay day is every 15th and 30th'),
  R('Berry smoothie at the pool bar'),
  R('Booked the shore tour for Tuesday'),
  R('Spare parts are in the store room'),
  R('Wi-Fi code is on the card'),
  R('Packed the red bag for the trip'),
  R('Cookie recipe from Maria'),
  R('Run at the gym'),
  R('Runtime error in the log'),
  R('Chicken soup at lunch'),
  R('Meeting with Sam', { type: 'event' }),
];
const find = (q: string) => localEngine.run(recs, q).results.slice(0, 3).map((r) => r.title);
let bad = 0;
const yes = (q: string, t: string) => { const got = find(q); const ok = got.includes(t); if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'} "${q}" → ${t}${ok ? '' : '   got: ' + (got.join(' | ') || '(nothing)')}`); };
const no = (q: string) => { const got = find(q); const ok = got.length === 0; if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'} "${q}" → nothing${ok ? '' : '   got: ' + got.join(' | ')}`); };

yes('where are the 2 chickens', 'There are two chicken on the fridge');
yes('where are the three keys', 'My 3 keys are in the drawer');
yes('who is cooking dinner', 'Maria cooks dinner on deck 5');
yes('when is the pay day', 'Pay day is every 15th and 30th');
yes('when is payday', 'Pay day is every 15th and 30th');
yes('what berries are at the pool bar', 'Berry smoothie at the pool bar');
yes('when did I book the shore tour', 'Booked the shore tour for Tuesday');
yes('what is the wi fi code', 'Wi-Fi code is on the card');
yes('where is the red bag I am packing', 'Packed the red bag for the trip');
yes('where is the cookie', 'Cookie recipe from Maria');
yes('who is running the gym', 'Run at the gym');
yes('where is the chiken', 'There are two chicken on the fridge');
// a typo may repair the record already found. It must not replace that record with a different one.
{
  const r = localEngine.run(recs, 'when is the meeting chiken');
  const titles = r.results.map((x) => x.title);
  const ok = titles.includes('Meeting with Sam') && !titles.includes('Chicken soup at lunch') && /chiken/i.test(r.closest || '');
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'} "meeting chiken" stays on the meeting${ok ? '' : '   got: ' + (titles.join(' | ') || '(nothing)') + ' closest=' + r.closest}`);
}
const cook = find('who is cooking dinner');
if (cook.includes('Cookie recipe from Maria')) { bad++; console.log('FAIL cooking dinner also returned the cookie'); }
else console.log('PASS cooking dinner leaves the cookie');
// things that must stay unfound
no('where is the party');          // "parts" is not "party"
{
  const got = find('who is running the gym');
  const ok = got.includes('Run at the gym') && !got.includes('Runtime error in the log');
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'} "running" finds "run" and leaves "runtime"${ok ? '' : '   got: ' + got.join(' | ')}`);
}
no('where are the spoons');        // nothing saved about spoons
no('what is the rice');            // no rice saved
console.log(bad ? `${bad} FAIL` : 'all forms checks pass');
