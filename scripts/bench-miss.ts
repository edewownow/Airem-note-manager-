/**
 * Miss-case bench — questions that match NOTHING, so the engine runs the full
 * fallback chain (strict pass, loose pass, one select() per dropped keyword).
 * This is where a per-question search cache should pay off.
 * Run:
 *   npx esbuild scripts/bench-miss.ts --bundle --platform=node --outfile=scripts/.bench-miss.js --alias:react-native-mmkv=./scripts/vault-sim/mocks/mmkv.ts --alias:expo=./scripts/vault-sim/mocks/expo.ts && node scripts/.bench-miss.js
 */
import { localEngine } from '../src/lib/query';
import type { Rec } from '../src/types';

let seed = 42;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];

const TITLES = ['Dentist appointment', 'Crew drill', 'Gym session', 'Dinner with Sam', 'Shore tour booking', 'Meeting about revenue', 'Call mom', 'Buy chicken', 'Flight to Manila', 'Birthday dinner', 'Laundry pickup', 'Watch movie', 'Team standup', 'Pay rent', 'Visit clinic', 'Buy bread', 'Fix printer', 'Read book', 'Walk the dog', 'Pay electricity'];
const PLACES = ['Deck 4', 'Manila office', 'Pike Place', 'Cabin 8123', 'Gym', 'Clinic', 'Market', 'Restaurant', 'Port', 'Home'];
const PEOPLE = ['Sam', 'Cristina', 'George', 'Mom', 'Shane', 'Jecil', 'Mary', 'Ed', 'Lela', 'Trey'];
const NOTES = ['bring the papers', 'on the fridge', 'call before going', 'check the price first', 'do not forget the ticket', 'after lunch', 'with the crew', 'near the pool', '', ''];

const N = 1000;
const recs: Rec[] = [];
for (let i = 0; i < N; i++) {
  const d = new Date(2026, 9 + Math.floor(rnd() * 4), 1 + Math.floor(rnd() * 28));
  recs.push({
    id: `r${i}`,
    type: pick(['event', 'note', 'reminder', 'event', 'note']),
    title: pick(TITLES),
    date: rnd() < 0.7 ? d.toISOString().slice(0, 10) : null,
    time: rnd() < 0.5 ? `${String(8 + Math.floor(rnd() * 10)).padStart(2, '0')}:${pick(['00', '15', '30', '45'])}` : null,
    location: pick(PLACES),
    people: pick(PEOPLE),
    notes: pick(NOTES),
    via: null,
    imageId: null,
    thumb: null,
  });
}

const QUESTIONS = [
  'zebra quantum pineapple',
  'when is the zzz meeting',
  'purple elephant parade',
  'buy a spaceship',
  'call the zork',
  'when is the meeting with zebras',
  'what is the quantum dentist',
  'where is the purple gym',
];

const t0 = Date.now();
let totalResults = 0;
for (let round = 0; round < 5; round++) {
  for (const q of QUESTIONS) {
    const r = localEngine.run(recs, q);
    totalResults += r.results.length;
  }
}
const ms = Date.now() - t0;
const runs = 5 * QUESTIONS.length;
console.log(`miss-case: records: ${N}, questions x${runs}, total results: ${totalResults}`);
console.log(`total: ${ms}ms, per question: ${(ms / runs).toFixed(2)}ms`);
