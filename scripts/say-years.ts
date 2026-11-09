/**
 * Years are spoken as years. Run:
 *   npx esbuild scripts/say-years.ts --bundle --platform=node --outfile=scripts/.sy.js && node scripts/.sy.js
 */
import { sayYears, yearWords } from '../src/lib/sayYears';
let bad = 0;
const ok = (c: boolean, m: string) => { if (!c) { bad++; console.log('✗', m); } else console.log('✓', m); };
const t = (a: string, b: string) => ok(sayYears(a) === b, `${a} → ${sayYears(a)}`);
t('It happened on June 12, 1898.', 'It happened on June 12, eighteen ninety-eight.');
t('Born June 12th 1898 in Paris', 'Born June 12th eighteen ninety-eight in Paris');
t('12 June 1898', '12 June eighteen ninety-eight');
t('The treaty was signed in 1066.', 'The treaty was signed in ten sixty-six.');
t('In 1905 and in 1900.', 'In nineteen oh five and in nineteen hundred.');
t('Since 2007 and in 2026.', 'Since two thousand seven and in twenty twenty-six.');
t('It was March 2000.', 'It was March two thousand.');
t('Sam owes you 1500 dollars.', 'Sam owes you 1500 dollars.');
t('The code is 1898.', 'The code is 1898.');
t('Locker 1234 on deck 4', 'Locker 1234 on deck 4');
t('Meeting at 1 PM on Saturday 31 October.', 'Meeting at 1 PM on Saturday 31 October.');
t('Total in 1998 dollars', 'Total in 1998 dollars');
ok(yearWords(1898) === 'eighteen ninety-eight', 'yearWords 1898');
console.log(bad ? `${bad} FAIL` : 'all year checks pass');
process.exit(bad ? 1 : 0);
