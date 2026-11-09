/**
 * feat/gemma-finder — TRIAL ONLY. Can Gemma FIND the right record when Airem's rules do not?
 * Same made-up records and questions go to Airem (rules) and to Gemma; both are scored.
 * Nothing here is used by the live app: Airem still decides which record answers.
 * Made-up data only — never the user's records.
 */
import type { Rec } from '../types';
import { GEMMA_SCHEMA, recordLines, shortIds, type TrialCase } from './gemma';

export { GEMMA_SCHEMA, shortIds };

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const R = (o: Partial<Rec> & { title: string }): Rec => ({
  id: 'f' + Math.random().toString(36).slice(2),
  type: 'note', date: null, time: null, location: null, people: null, notes: null,
  via: 'trial', imageId: null, thumb: null, ...o,
});

export function finderRecords(now: Date = new Date()): Rec[] {
  const day = (n: number) => { const d = new Date(now); d.setDate(d.getDate() + n); return iso(d); };
  return [
    R({ title: 'There are two chicken on the fridge' }),
    R({ title: 'The wifi password is printed on the bulletin board' }),
    R({ title: 'The spare key is under the mat' }),
    R({ title: 'Sam owes me 20 dollars' }),
    R({ title: 'My locker is number 12 on deck 4' }),
    R({ title: 'The gym opens at 6 am' }),
    R({ title: 'Maria is Juan’s older sister' }),
    R({ title: 'Laundry room is on deck 3, open 8 to 5' }),
    R({ title: 'Pay day is every 15th and 30th' }),
    R({ title: 'The tailor shop in Manila closes at 7 pm' }),
    R({ title: 'Mom’s birthday is on December 6' }),
    R({ title: 'Buy rice and eggs at the market' }),
    R({ title: 'Muster drill is at lifeboat station B' }),
    R({ type: 'event', title: 'Meeting', date: day(2), time: '13:00' }),
    R({ type: 'event', title: 'Crew party', date: day(3), time: '20:00', location: 'Crew bar' }),
    R({ type: 'event', title: 'Dentist', date: day(1), time: '09:00', location: 'Main clinic', people: 'Dr Cruz' }),
    R({ type: 'event', title: 'Flight to Manila', date: day(9), time: '06:30', location: 'NAIA Terminal 3' }),
    R({ type: 'event', title: 'Safety training', date: day(5), time: '10:00', location: 'Conference room' }),
    R({ type: 'event', title: 'Visa interview', date: day(12), time: '14:00', location: 'US embassy' }),
    R({ type: 'reminder', title: 'Call mom', date: day(4) }),
    R({ type: 'reminder', title: 'Renew seaman’s book', date: day(30) }),
    R({ type: 'reminder', title: 'Pay the electric bill', date: day(6) }),
    R({ type: 'invoice', title: 'Shore tour Santorini', notes: 'Total 85 EUR, paid by card' }),
    R({ type: 'invoice', title: 'Uniform tailoring', notes: 'Total 40 USD, not paid yet' }),
  ];
}

export type FinderKind = 'plain' | 'other words' | 'typo' | 'misheard' | 'not saved' | 'noise';
export interface FinderCase extends TrialCase { kind: FinderKind; first?: string; not?: string[] }

const C = (kind: FinderKind, q: string, want: string[], says?: string[][], first?: string, not?: string[]): FinderCase =>
  ({ kind, q, want, says, first, not });

export const FINDER_CASES: FinderCase[] = [
  C('plain', 'where is the chicken', ['There are two chicken on the fridge'], [['fridge']]),
  C('plain', 'what is the wifi password', ['The wifi password is printed on the bulletin board'], [['bulletin']]),
  C('plain', 'where is the spare key', ['The spare key is under the mat'], [['mat']]),
  C('plain', 'who owes me money', ['Sam owes me 20 dollars'], [['sam']]),
  C('plain', 'what time does the gym open', ['The gym opens at 6 am'], [['6', 'six']], 'The gym opens at 6 am'),
  C('plain', 'when is the meeting', ['Meeting'], [['1 pm', '1:00']], 'Meeting'),
  C('plain', 'where is the crew party', ['Crew party'], [['crew bar']], 'Crew party'),
  C('plain', 'when is my flight', ['Flight to Manila']),
  C('plain', 'how much was the Santorini tour', ['Shore tour Santorini'], [['85']], 'Shore tour Santorini'),
  C('plain', 'where is the laundry', ['Laundry room is on deck 3, open 8 to 5'], [['deck 3', 'three']]),
  C('other words', 'what is in the refrigerator', ['There are two chicken on the fridge'], [['chicken']]),
  C('other words', 'what is the internet password', ['The wifi password is printed on the bulletin board'], [['bulletin']]),
  C('other words', 'when do I get my salary', ['Pay day is every 15th and 30th'], [['15']]),
  C('other words', 'when is the get together', ['Crew party']),
  C('other words', 'which day is my plane', ['Flight to Manila']),
  C('other words', 'what time is the tooth doctor', ['Dentist'], [['9']], 'Dentist'),
  C('other words', 'how much do I owe the tailor', ['Uniform tailoring'], [['40']]),
  C('other words', 'where do I go for the lifeboat drill', ['Muster drill is at lifeboat station B'], [['b']]),
  C('other words', 'who is Juan’s sibling', ['Maria is Juan’s older sister'], [['maria']]),
  C('other words', 'what groceries do I need', ['Buy rice and eggs at the market'], [['rice']]),
  C('typo', 'where is the chiken', ['There are two chicken on the fridge'], [['fridge']]),
  C('typo', 'what is the wifi pasword', ['The wifi password is printed on the bulletin board'], [['bulletin']]),
  C('typo', 'when is the meetng', ['Meeting']),
  C('typo', 'when is the dentst', ['Dentist']),
  C('typo', 'where is the lifeboat staton', ['Muster drill is at lifeboat station B']),
  C('typo', 'when does the laundy open', ['Laundry room is on deck 3, open 8 to 5'], [['8']]),
  C('misheard', 'what time does the jim open', ['The gym opens at 6 am'], [['6', 'six']]),
  C('misheard', 'when is mom birth day', ['Mom’s birthday is on December 6'], [['december', '6']]),
  C('misheard', 'who owes me 20 bucks', ['Sam owes me 20 dollars'], [['sam']]),
  C('misheard', 'when is the crew potty', ['Crew party']),
  C('misheard', 'where is the visa inter view', ['Visa interview'], [['embassy']]),
  C('misheard', 'when is the safety train in', ['Safety training']),
  C('not saved', 'where is my passport', []),
  C('not saved', 'what is the captain’s name', []),
  C('not saved', 'when is my vacation', []),
  C('not saved', 'what is my cabin number', []),
  // Noise: a record matching one incidental word must not outrank — or outstay — the
  // record that actually answers. The `first` lock pins the ranking; `not` proves
  // the floor dropped the weak hit once a real match exists.
  C('noise', 'when does the gym open', ['The gym opens at 6 am'], [['6', 'six']], 'The gym opens at 6 am', ['Laundry room is on deck 3, open 8 to 5']),
  C('noise', 'what time is the laundry open', ['Laundry room is on deck 3, open 8 to 5'], [['8']], 'Laundry room is on deck 3, open 8 to 5', ['The gym opens at 6 am']),
  C('noise', 'when is my flight to Manila', ['Flight to Manila'], undefined, 'Flight to Manila', ['The tailor shop in Manila closes at 7 pm']),
  C('noise', 'when is the party on deck three', ['Laundry room is on deck 3, open 8 to 5'], undefined, 'Laundry room is on deck 3, open 8 to 5', ['Crew party']),
];

export const FINDER_SYSTEM = (now: Date): string => [
  `You FIND the saved records that answer the user's question. Today is ${now.toDateString()}.`,
  'The question may have spelling slips, speech-recognition mistakes, or different words for the same thing (fridge/refrigerator, wifi/internet, party/get together). Match by meaning.',
  'Use ONLY facts written in the records. Never invent a date, time, place, person, number or amount.',
  'If a record answers the question: found=true, answer in one or two short spoken sentences to the user as "you", ids = the record ids you used.',
  'The spoken answer must not mention record ids. No "r1" and no "ids=". Ids belong only in the ids field.',
  'If no record answers it: found=false, answer="", ids=[]. Do not guess.',
  'Say dates as words, times like "1 PM". No lists, no markdown.',
].join('\n');

export const finderPrompt = (q: string, recs: Rec[], now: Date): { ids: Map<string, Rec>; prompt: string } => {
  const ids = shortIds(recs);
  return { ids, prompt: `Records:\n${recordLines(ids, now)}\n\nQuestion: ${q.trim()}` };
};
