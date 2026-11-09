/**
 * About → Voice commands: every example phrase must behave as the About screen says (voice.35).
 * Update this file whenever COMMANDS in src/components/AboutScreen.tsx changes. Run:
 *   npx esbuild scripts/about-examples.ts --bundle --platform=node --outfile=scripts/.about.js --alias:react-native-mmkv=./scripts/vault-sim/mocks/mmkv.ts && node scripts/.about.js
 */
import { parsePrivateSearch, parsePrivateSave, parseExpiryAsk, askForAnyCard, askForLetters } from '../src/lib/privateSearch';
import { classifyIntent } from '../src/lib/intent';
import { parseListAll } from '../src/lib/listCommands';
import { parseVoiceCommand, inferVoiceCommand } from '../src/lib/command';
import { parseWhen } from '../src/lib/query';
let bad = 0; const ok = (c: boolean, m: string) => { if (!c) { bad++; console.log('✗', m); } };
const route = (q: string) => parseListAll(q) ? 'list:' + (parseListAll(q)!.where === 'private' ? 'private' : 'records') : parseExpiryAsk(q) ? 'expiry' : parsePrivateSearch(q) !== null ? 'psearch' : parsePrivateSave(q) ? 'psave:' + parsePrivateSave(q)!.kind : (askForLetters(q) ?? askForAnyCard(q)) ? 'card?' : classifyIntent(q).intent + (classifyIntent(q).sure ? '' : '?');
const want: [string, string][] = [
  ["what's on tomorrow?", 'ask'], ['do I have anything tonight?', 'ask'], ['today', 'ask'],
  ['remind me to buy bread', 'save'], ['dinner with Sam Friday at 7', 'save'], ['Penfolds is 25 dollars', 'save'],
  ['what is my SSS no.', 'psearch'], ['what is my crew ID number', 'card?'], ['what is my S R B', 'psearch'],
  ['when does my passport expire?', 'expiry'], ['is my visa expired?', 'expiry'], ['which documents expire this year?', 'expiry'],
  ["what's my gmail password", 'psearch'], ['netflix password?', 'psearch'], ['password search bank', 'psearch'],
  ['list all passwords', 'list:private'], ['list all IDs', 'list:private'], ['list all private notes', 'list:private'], ['show everything private', 'list:private'],
  ['list all reminders', 'list:records'], ['list all notes', 'list:records'], ['list all schedules', 'list:records'], ['list all my records', 'list:records'],
  ['when I say PH I mean PhilHealth', 'ask'], ['remember that crew bar means Crew Bar deck 4', 'ask'],
  ['show my passwords', 'list:private'], ['what are my passwords', 'list:private'],
  ['what is my PhilHealth ID', 'psearch'], ['what is my HDMF number', 'psearch'],
  ['save my passport', 'psave:doc'], ['save my SSS number', 'psave:doc'], ['save my crew ID', 'psave:doc'], ['my SSS number is 34-1234567-8', 'psave:doc'],
  ['save password for gmail username ede password abc', 'psave:password'], ['save my PC pin', 'psave:password'], ['save my laptop password', 'psave:password'],
  ['save my locker code 1234', 'psave:note'], ['save my wifi', 'psave:note'], ['private note locker code 12 34 56', 'psave:note'],
  ['remind me to change my password', 'save'], ['remind me to renew my visa', 'save'], ['pay my SSS contribution on the 10th', 'save'], ['my passport expires in March', 'save'],
  ["what's next year?", 'ask'], ['what do I have in 2028?', 'ask'], ["what's in March 2028?", 'ask'],
];
for (const [q, w] of want) { const r = route(q); ok(r === w, `${JSON.stringify(q)} → ${r} (About says ${w})`); }
const today = new Date(); today.setHours(0, 0, 0, 0);
for (const [q, check] of [['remind me to renew my passport next year', (d: string) => +d.slice(0, 4) === today.getFullYear() + 1], ['sign on in Miami on 3rd November 2027', (d: string) => d === '2027-11-03'], ['remind me on March 5, 2028', (d: string) => d === '2028-03-05'], ['remind me on 5/3/2027', (d: string) => d === '2027-03-05'], ['remind me in March next year', (d: string) => d === `${today.getFullYear() + 1}-03-01`], ['remind me March 2028', (d: string) => d === '2028-03-01']] as [string, (d: string) => boolean][]) {
  const c = parseVoiceCommand(q) ?? inferVoiceCommand(q); const d = parseWhen(c.fields.when).date ?? '';
  ok(check(d), `date ${JSON.stringify(q)} → ${d}`);
}
if (bad) process.exitCode = 1;
console.log(bad ? `${bad} About example(s) wrong` : `all ${want.length + 6} About examples behave as described`);
