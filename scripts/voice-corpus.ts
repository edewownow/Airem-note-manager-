/**
 * Voice-label corpus (1.9.5) — every sentence with the label MemoAirem must pick when no trigger
 * phrase is said (reminder / event = schedule / note). Re-run after ANY change to the rules in
 * src/lib/command.ts (MEMOAIREM_MANIFEST.md §8, 1.9.5 standing rule):
 *
 *   npx esbuild scripts/voice-corpus.ts --bundle --platform=node --outfile=scripts/.voice-corpus.js && node scripts/.voice-corpus.js
 *   (add "say" at the end to hear every read-back as text)
 *
 * Add a sentence here whenever one is labelled wrong on the phone.
 */
import { inferVoiceCommand, parseVoiceCommand } from '../src/lib/command';
import { DOC_TITLES } from '../src/lib/privateDocs';
import { spokenConfirm } from '../src/lib/voice';
import { parseWhen } from '../src/lib/query';
const now = new Date('2026-10-26T20:20:00');
type K = 'reminder' | 'event' | 'note';
export const CASES: [string, K][] = [
  // reminders
  ['buy a bread on your way home', 'reminder'], ['get toothpaste', 'reminder'], ['call mom tomorrow at 9', 'reminder'],
  ['pick up laundry', 'reminder'], ['I need to renew my SID', 'reminder'], ["don't forget the passport", 'reminder'],
  ['remember to bring the white gloves', 'reminder'], ['text Sam about the shift swap', 'reminder'],
  ['pay the internet bill on Friday', 'reminder'], ['send money home on payday', 'reminder'],
  ['tell the maitre d about table 12', 'reminder'], ['ask the head waiter for a day off', 'reminder'],
  ['top up the crew card', 'reminder'], ['book flights home', 'reminder'], ['order new shoes', 'reminder'],
  ['change the bedsheets', 'reminder'], ['wash my uniform', 'reminder'], ['I have to submit the timesheet by 5 pm', 'reminder'],
  ['I should water the plants', 'reminder'], ['make sure to lock the cabin', 'reminder'], ['go to the bank tomorrow', 'reminder'],
  ['need milk', 'reminder'], ['I need milk and eggs', 'reminder'], ['buy 2 bottles of water tomorrow', 'reminder'],
  ['I gotta fix the printer', 'reminder'], ['must sign the contract', 'reminder'], ['get a haircut on Saturday', 'reminder'],
  ['okay um buy batteries', 'reminder'], ['also call the agency', 'reminder'], ['see the doctor about my back', 'reminder'],
  ['email the crew office', 'reminder'], ['Buy sunscreen before Cozumel', 'reminder'], ['charge my phone', 'reminder'],
  ['print the boarding pass', 'reminder'], ['return the library book', 'reminder'], ['cancel the gym membership', 'reminder'],
  // schedule
  ['dinner with Sam on Friday at 7', 'event'], ['crew party tomorrow night at 11 pm on the open deck', 'event'],
  ['dentist appointment Thursday at 3 pm', 'event'], ['boat drill tomorrow at 10 am', 'event'],
  ['meeting with the restaurant manager at 4 pm', 'event'], ['lifeboat drill on Monday', 'event'],
  ['port day in Cozumel on October 30', 'event'], ['my flight home is on December 15', 'event'],
  ['shift starts at 6 am', 'event'], ['training at 2:30', 'event'], ['inspection next Tuesday at 9', 'event'],
  ["Sam's birthday on November 3", 'event'], ['coffee with Priya tomorrow morning', 'event'],
  ['movie in the crew bar tonight at 8', 'event'], ['meet Sam at the gangway at 5 pm', 'event'],
  ['go to the dentist on Thursday at 3', 'event'], ['visit the clinic tomorrow at 10 am', 'event'],
  ['team briefing every day at 4 pm', 'event'], ['sign on in Miami on 3rd November', 'event'],
  ['tonight at 9 buffet closing party', 'event'], ['the gala dinner is on Saturday', 'event'],
  // notes
  ['penfolds chardonnay is 25$', 'note'], ['the wine list is on page 2', 'note'], ['Sam likes his coffee black', 'note'],
  ['table 12 is allergic to nuts', 'note'], ['the Wi-Fi password is crew2026', 'note'], ['deck 5 has the crew gym', 'note'],
  ['cabin 4123 is my new cabin', 'note'], ["Monday's menu has lobster", 'note'], ["the captain's name is John Smith", 'note'],
  ['I paid 40 dollars for lunch yesterday', 'note'], ['my favorite wine is the 2018 Barolo', 'note'],
  ['the price of Moet is 120 dollars', 'note'], ['7 tables in my station', 'note'], ['buy-in for the poker night is 50', 'note'],
  ['check out time is 10 am', 'event'], ['pick up point is deck 2', 'note'], ['get well card from the team was lovely', 'note'],
  ['the guest in 8012 wants extra pillows', 'note'], ['Opus One 2019 costs 450 dollars a bottle', 'note'],
  ['call sign of the ship is ZCDF4', 'note'], ['order of service is soup then salad', 'note'],
  ['great sunset at sea today', 'note'], ['the new sommelier is from Portugal', 'note'], ['booking reference is XK7P2', 'note'],
  ['Friday is formal night', 'event'],
];
let bad = 0;
for (const [s, want] of CASES) {
  if (parseVoiceCommand(s, now)) { console.log('CMD!', s); bad++; continue; }
  const c = inferVoiceCommand(s, now);
  if (c.kind !== want) { bad++; console.log(`✗ ${want.padEnd(8)} got ${c.kind.padEnd(8)} "${s}"  ${JSON.stringify(c.fields)}`); }
}
console.log(`\n${CASES.length - bad}/${CASES.length} correct`);
if (process.argv[2] === 'say') for (const [s] of CASES) {
  const c = inferVoiceCommand(s, now); const { date, time } = parseWhen(c.fields.when || '');
  console.log(`${c.kind.padEnd(8)} 🔊 ${spokenConfirm({ type: c.kind, title: c.fields.what, date, time, location: c.fields.where || null, people: c.fields.who || null, notes: c.fields.notes || null } as any, now, true)}`);
}
// extra guards: real to-dos with a later "is"
for (const s of ['buy a gift for Sam because he is leaving', 'call home and say the ship is late', 'tell the chef the soup is cold', 'check if the cabin is ready'])
  console.log(inferVoiceCommand(s, now).kind === 'reminder' ? '✓' : '✗', 'reminder', s);
for (const s of ['ask the purser when the crew bar is open','email HR the contract is signed','text Sam the gangway is on deck 4']) console.log(inferVoiceCommand(s, now).kind === 'reminder' ? '✓' : '✗', 'reminder', s);
for (const s of ['tell me the price is 30','emails from the office are slow']) console.log(inferVoiceCommand(s, now).kind, '—', s);

/* 1.10.2 — spoken passwords must go to the Private folder; ordinary notes must not. */
import { parsePrivateSave } from '../src/lib/privateSearch';
const SECRET: string[] = [
  'save this password bank app is 1234', 'save password for gmail username ede dot v at gmail dot com password summer2026',
  'save my password for crew portal user ede123 and password Wave77', 'store my PIN for the ATM is 4471',
  'new password for crew portal is Wave77', 'the crew wifi password is crew2026', 'save this password 9981 for the safe',
  'my PIN is 5566', 'save login for HR portal username evallejos password Ship 2026', 'save this password for netflix',
  'the security code on the card is 321', 'private note locker combination 12 34 56',
];
const NOT_SECRET = ['remind me to change my password', 'I forgot my gmail password', 'password reset email from HR', 'pin the poster on the board', 'pass the salt'];
let pbad = 0;
for (const s of SECRET) if (!parsePrivateSave(s)) { pbad++; console.log('✗ should be PRIVATE:', s); }
// In the label corpus but a real secret since 1.10.2 — the safety net SHOULD send it to Private.
const NOW_PRIVATE = new Set(['the Wi-Fi password is crew2026']);
for (const s of NOW_PRIVATE) if (!parsePrivateSave(s)) { pbad++; console.log('✗ should be PRIVATE:', s); }
for (const s of [...NOT_SECRET, ...CASES.map(([s]) => s).filter((s) => !NOW_PRIVATE.has(s))]) if (parsePrivateSave(s)) { pbad++; console.log('✗ should NOT be private:', s); }
console.log(`private routing: ${SECRET.length + NOT_SECRET.length + CASES.length - pbad}/${SECRET.length + NOT_SECRET.length + CASES.length} correct`);
if (bad || pbad) process.exitCode = 1;

/* 1.10.12 — ID numbers go to Private; asking for an ID / password on the main page opens Private. */
import { parsePrivateSearch } from '../src/lib/privateSearch';
const ID_SAVE = ['my SSS number is 34-1234567-8', 'save my TIN 123-456-789-000', 'PhilHealth number 12-345678901-2', 'pag ibig MID 1234-5678-9012', 'my passport number is P1234567A'];
const ID_NOT = ['pay my SSS contribution on the 10th', 'my passport expires in March 2030', 'remind me to update my PhilHealth', 'renew passport on Friday', 'SSS office opens at 8'];
const ASK_PRIVATE = ["what's my SSS number?", 'what is my TIN', "what's my gmail password", 'password for netflix', 'netflix password?'];
// voice.29: "what's my passport expiry" left this list — expiry questions go to the Private folder's
// documents now (parseExpiryAsk; tested in scripts/private-asr-corpus.ts)
const ASK_NORMAL = ["what's on tomorrow", 'when is my dentist', 'remind me to change my password', 'the wifi password is crew2026', "what's in the tin"];
let ibad = 0;
// voice.28: passports, seaman's books, SRB, licences, visas → a private DOCUMENT; other IDs → a private note
const privKind = (title: string) => (DOC_TITLES.has(title) ? 'doc' : 'note');
for (const s of ID_SAVE) { const d = parsePrivateSave(s); if (!d || d.kind !== privKind(d.title)) { ibad++; console.log('✗ should be a PRIVATE note / document:', s, d?.kind); } }
for (const s of ID_NOT) if (parsePrivateSave(s)) { ibad++; console.log('✗ should stay ordinary:', s); }
for (const s of ASK_PRIVATE) if (parsePrivateSearch(s) === null) { ibad++; console.log('✗ should open Private:', s); }
for (const s of [...ASK_NORMAL, ...CASES.map(([s]) => s)]) if (parsePrivateSearch(s) !== null) { ibad++; console.log('✗ should stay a normal question:', s); }
const itotal = ID_SAVE.length + ID_NOT.length + ASK_PRIVATE.length + ASK_NORMAL.length + CASES.length;
console.log(`ID + private questions: ${itotal - ibad}/${itotal} correct`);
if (ibad) process.exitCode = 1;

/* 1.10.14 — "save my <ID> no." (no number yet) opens the Private note prompt; works on the main screen too. */
const SAVE_NO_VALUE = ['save my pag ibig id no.', 'save my passport no.', 'save my SSS number', 'save my tin', 'add my philhealth no.'];
const SAVE_NOT = ['save the SSS contribution receipt', 'add my passport renewal to the schedule', 'save dinner with Sam on Friday', 'remind me to renew my passport'];
let sbad = 0;
for (const s of SAVE_NO_VALUE) { const d = parsePrivateSave(s); if (!d || d.kind !== privKind(d.title) || !d.title || d.content) { sbad++; console.log('✗ should open the note / document prompt:', s); } }
for (const s of SAVE_NOT) if (parsePrivateSave(s) || parsePrivateSearch(s) !== null) { sbad++; console.log('✗ should stay normal:', s); }
console.log(`save-my-ID: ${SAVE_NO_VALUE.length + SAVE_NOT.length - sbad}/${SAVE_NO_VALUE.length + SAVE_NOT.length} correct`);
if (sbad) process.exitCode = 1;

/* 1.10.15 — "save" + ANY card / ID name + "number" / "no." (the number may follow) → Private note. */
const CARD_YES: [string, string][] = [['save my bank card no.', 'Bank card'], ['save my crew ID number', 'Crew ID'], ['save my BDO account number 1234-5678-90', 'BDO account'],
  ['save my locker number', 'Locker'], ['save my company id no. 4471', 'Company ID'], ['keep my cabin key card number', 'Cabin key card']];
const CARD_NO = ['save the room number 8012 for the guest', 'remind me to save the table number', 'set schedule meeting number 2 at 3 pm', 'note the cabin number is 4123'];
let cbad = 0;
// voice.31: "save my <card> number / no. / ID" → the DOCUMENT form (every ID is a document)
for (const [s, t] of CARD_YES) { const d = parsePrivateSave(s); if (d?.kind !== 'doc' || d.title !== t) { cbad++; console.log('✗ should open the document form:', s, d); } }
for (const s of CARD_NO) if (parsePrivateSave(s)) { cbad++; console.log('✗ should stay normal:', s); }
console.log(`save-any-card: ${CARD_YES.length + CARD_NO.length - cbad}/${CARD_YES.length + CARD_NO.length} correct`);
if (cbad) process.exitCode = 1;
