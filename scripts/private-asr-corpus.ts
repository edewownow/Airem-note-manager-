/**
 * Built-in listener spellings + any-card asks (1.12.0-voice.8). The mishearings are what Parakeet TDT v2
 * actually wrote in tests with sherpa-onnx ("semen book", "pug e-big", "SRB now"). Run:
 *   npx esbuild scripts/private-asr-corpus.ts --bundle --platform=node --outfile=scripts/.private-asr.js --alias:react-native-mmkv=./scripts/vault-sim/mocks/mmkv.ts && node scripts/.private-asr.js
 */
import { parsePrivateSearch, parsePrivateSave, matchPrivate, askForAnyCard, askForLetters, compactLetters, parseExpiryAsk, draftHasSecret } from '../src/lib/privateSearch';
import { localEngine } from '../src/lib/query';
import { DOC_TITLES } from '../src/lib/privateDocs';
const mk = (title: string): any => ({ id: title, type: 'private-note', title, date: null, time: null, location: null, people: null, notes: '1234567', via: 'voice', imageId: null, thumb: null });
const vault = ['Srb', 'SSS', 'Pag-IBIG', "Seaman's book", 'Crew ID', 'Netflix', 'PhilHealth'].map(mk);
let bad = 0;
const t = (c: boolean, m: string) => { console.log(c ? '✓' : '✗', m); if (!c) bad++; };
const ask = (q: string) => parsePrivateSearch(q) ?? askForAnyCard(q);
const finds = (q: string, title: string) => { const term = ask(q); const f = term == null ? [] : matchPrivate(vault, term).map((r: any) => r.title); return { term, ok: f.includes(title), f }; };
for (const [q, title] of [
  ['What is my SRB number?', 'Srb'], ['what is my SRB no.', 'Srb'], ['What is my SRB now?', 'Srb'], ['What is my S R B number?', 'Srb'], ['what is my s.r.b. no', 'Srb'],
  ['What is my crew ID number?', 'Crew ID'], ['What is my pug e-big number?', 'Pag-IBIG'], ['What is my pog e big number?', 'Pag-IBIG'],
  ['What is my pill health number?', 'PhilHealth'], ['What is my Pill Health ID?', 'PhilHealth'], ['What is my SRB ID?', 'Srb'], ['What is my crew ID?', 'Crew ID'], ['What is my Pill Health?', 'PhilHealth'], ['what is my fill health no.', 'PhilHealth'], ['What is my feel health number?', 'PhilHealth'],
  ['What is my semen book number?', "Seaman's book"], ['What is my Siemen book number?', "Seaman's book"], ['What is my SSS now?', 'SSS'],
] as [string, string][]) { const r = finds(q, title); t(r.ok, `ask ${JSON.stringify(q)} → ${JSON.stringify(r.term)} → ${JSON.stringify(r.f)}`); }
for (const [q, title, content] of [
  ['Save my SRB now.', 'SRB', ''], ['Save my sRB number.', 'SRB', ''], ['Save my S R B no.', 'SRB', ''], ['Save my semen book number.', "Seaman's book", ''],
  ['Save my pog e big number.', 'Pag-IBIG', ''], ['Save my crew ID.', 'Crew ID', ''], ['Save my company ID 4521', 'Company ID', '4521'], ['Save my PhilHealth ID.', 'PhilHealth', ''], ['Save my Pill Health ID.', 'PhilHealth', ''], ['Save my pill health number.', 'PhilHealth', ''], ['Save my Pill Health now.', 'PhilHealth', ''], ['Save my crew ID now', 'Crew ID', ''], ['save my SRB no. 1234567', 'SRB', '1234567'],
] as [string, string, string][]) { const d = parsePrivateSave(q); t(!!d && d.title === title && d.content === content, `save ${JSON.stringify(q)} → ${JSON.stringify(d && { title: d.title, content: d.content })}`); }
// must stay normal
for (const q of ['Remind me to bring my ID.', 'Remind me to take my pill for my health.', 'Remind me to buy a big book.', 'What is my room number?', 'take note room number 8012', 'What time is dinner now?', 'pay my SSS contribution on the 10th'])
  t(parsePrivateSearch(q) === null && parsePrivateSave(q) === null, `normal stays normal: ${JSON.stringify(q)}${askForAnyCard(q) ? ' (ask-any would try Private only if normal records have nothing: ' + askForAnyCard(q) + ')' : ''}`);
t(compactLetters('S R B') === 'SRB' && compactLetters('S.R.B.') === 'SRB' && compactLetters('sRB') === 'SRB' && compactLetters('I am a seaman') === 'I am a seaman', 'compactLetters');
// voice.9 — the Assistant's exact routing order (Assistant.tsx ask()), with a week of schedules and a
// normal "Room number 8012" note. Device: "what is my S R B" showed the whole week (build 54).
const dd = (n: number) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const normal: any[] = [0, 1, 2, 3, 4, 5].map((n) => ({ id: 'r' + n, type: 'schedule', title: 'Boat drill ' + n, date: dd(n), time: '10:00', location: 'Deck 4', people: null, notes: null, via: 'voice', imageId: null, thumb: null }));
normal.push({ id: 'room', type: 'note', title: 'Room number 8012', date: null, time: null, location: null, people: null, notes: null, via: 'voice', imageId: null, thumb: null });
function route(q: string): string {
  const priv = parsePrivateSearch(q); if (priv !== null) return 'P:' + priv;
  const save = parsePrivateSave(q); if (save) return 'S:' + save.title;
  const card = askForLetters(q) ?? askForAnyCard(q); if (card && !localEngine.run(normal, card).results.length) return 'P:' + card;
  return 'N:' + localEngine.run(normal, q).results.length;
}
for (const [q, want] of [
  ['what is my S R B', 'P:SRB'], ['What is my SRB now?', 'P:SRB'], ['What is my crew ID number?', 'P:crew'], ['What is my bank card number?', 'P:bank card'],
  ['What is my room number?', 'N:1'], ['what is on tomorrow', 'N:1'], ['What is my pug e-big number?', 'P:Pag-IBIG'],
  // voice.10 — spelled letters never mean "show everything"
  ['What is my S-R-B?', 'P:SRB'], ['What is my S, R, B?', 'P:SRB'], ['What is my S R V?', 'P:SRV'], ['What is my SRV?', 'P:SRV'],
  ['What is my T I N?', 'P:TIN'], ['What is my schedule?', 'N:6'],
] as [string, string][]) { const got = route(q); t(got === want, `route ${JSON.stringify(q)} → ${got}`); }
// voice.10 — one letter off (B/V/P): the folder still shows SRB
t(JSON.stringify(matchPrivate(vault, 'SRV').map((r: any) => r.title)) === '["Srb"]', 'near-miss "SRV" → SRB');
t(JSON.stringify(matchPrivate(vault, 'SRP').map((r: any) => r.title)) === '["Srb"]', 'near-miss "SRP" → SRB');
t(matchPrivate(vault, 'XYZ').length === 0 && matchPrivate(vault, 'SSS').map((r: any) => r.title).join() === 'SSS', 'no near-miss for unrelated letters; exact match wins');
// voice.25 — device: "save my pc pin no." opened a Private LOOKUP instead of a new private item
for (const [q, title, pw] of [
  ['save my pc pin no.', 'PC', ''], ['Save my PC PIN number.', 'PC', ''], ['Save my PC pin.', 'PC', ''], ['Save my PC PIN now.', 'PC', ''],
  ['save my laptop password', 'Laptop', ''], ['save my ATM pin', 'ATM', ''], ['save my bank pin number 1234', 'Bank', '1234'],
] as [string, string, string][]) {
  const d = parsePrivateSave(q);
  t(parsePrivateSearch(q) === null && d?.kind === 'password' && d.title === title && d.password === pw, `save secret ${JSON.stringify(q)} → ${JSON.stringify(d && { kind: d.kind, title: d.title, password: d.password })}`);
}
// voice.26 — the user's rule: "save my + label" → a Private note with the label filled in
for (const [q, title, c] of [
  ['save my SRB', 'SRB', ''], ['Save my SRB.', 'SRB', ''], ['save my locker code', 'Locker code', ''], ['save my locker code 1234', 'Locker code', '1234'],
  ['Save my wifi.', 'Wifi', ''], ['save my S R B', 'SRB', ''], ['Save my passport.', 'Passport', ''],
] as [string, string, string][]) {
  const d = parsePrivateSave(q);
  // voice.28: documents (SRB, Passport …) open the document form; other labels a note
  t(d?.kind === (DOC_TITLES.has(title) ? 'doc' : 'note') && d.title === title && d.content === c, `save my label ${JSON.stringify(q)} → ${JSON.stringify(d && { title: d.title, content: d.content })}`);
}
for (const q of ['save dinner with Sam on Friday', 'save the SSS contribution receipt', 'remind me to save my work']) t(parsePrivateSave(q) === null, `no "save my" → stays normal: ${JSON.stringify(q)}`);
t(parsePrivateSearch('what is my pc pin') === 'pc' && parsePrivateSave('what is my pc pin') === null, 'asking for the PC pin is still a lookup');
// voice.28 — documents by voice
for (const [q, title, no] of [['save my passport', 'Passport', ''], ['my passport number is P1234567A', 'Passport', 'P1234567A'], ["save my seaman's book", "Seaman's book", ''], ['Save my semen book number.', "Seaman's book", ''], ['save my visa', 'Visa', ''], ["save my driver's license number", "Driver's license", '']] as [string, string, string][]) {
  const d = parsePrivateSave(q);
  t(d?.kind === 'doc' && d.title === title && d.content === no, `document by voice ${JSON.stringify(q)} → ${JSON.stringify(d && { kind: d.kind, title: d.title, no: d.content })}`);
}
// voice.31: every ID is a document now — SSS / TIN too; "private note …" and plain labels stay notes
for (const q of ['save my SSS number', 'save my TIN', 'my SSS number is 34-1234567-8']) t(parsePrivateSave(q)?.kind === 'doc', `ID → document: ${q}`);
t(parsePrivateSave('my SSS number is 34-1234567-8')?.content === '34-1234567-8', 'the number said goes into No.');
t(parsePrivateSave('private note SSS 34-1234567-8')?.kind === 'note', '"private note …" stays a note');
t(parsePrivateSave('save my locker code 1234')?.kind === 'note' && parsePrivateSave('save my wifi')?.kind === 'note', 'plain labels stay notes');
t(parsePrivateSave('remind me to renew my visa') === null && parsePrivateSearch('what is my visa') === 'Visa', 'visa: reminder stays normal; asking opens the Private folder');
// voice.29 — expiry questions → the Private folder's documents
for (const [q, term, all] of [
  ['when does my passport expire', 'Passport', false], ['when my passport expire', 'Passport', false], ["what's my passport expiry", 'Passport', false],
  ['when is my passport expiry date', 'Passport', false], ['is my passport expired', 'Passport', false], ["when does my seaman's book expire", "Seaman's book", false],
  ['has my visa expired', 'Visa', false], ['when will my SRB expire', 'SRB', false], ["what's the expiry date of my passport", 'Passport', false],
  ['my passport expiring?', 'Passport', false], ['which documents expire this year', '', true], ['what documents are expiring', '', true],
] as [string, string, boolean][]) {
  const e = parseExpiryAsk(q);
  t(!!e && e.term === term && e.all === all, `expiry ask ${JSON.stringify(q)} → ${JSON.stringify(e)}`);
}
for (const q of ['my passport expires in March', 'my visa expires on 5/3/2027', 'remind me when my passport expires', 'what is on tomorrow'])
  t(parseExpiryAsk(q) === null, `not an expiry question: ${JSON.stringify(q)}`);
t(parseExpiryAsk('when does my contract expire')?.known === false, 'unknown name ("contract") → only if normal records have nothing');
t(parseExpiryAsk('when is my canadian visa expiring')?.term === 'canadian visa' && parseExpiryAsk('when is my canadian visa expiring')?.known === true, 'canadian visa keeps its identifier');
t(parseExpiryAsk('when is my mcv visa expiring')?.term === 'mcv visa', 'MCV visa keeps its identifier');
t(parseExpiryAsk('when is my maritime crew visa expiring')?.term === 'maritime crew visa', 'maritime crew visa stays the whole name');
// voice.37 — the Google warning only when a secret was SAID (user: "without ID no. or pin or password it does not need to warn me")
for (const [q, secret] of [
  ['save my passport', false], ['save my PC pin', false], ['save my SSS number', false], ['save my wifi', false], ['save my laptop password', false],
  ['save my passport P1234567A', true], ['my SSS number is 34-1234567-8', true], ['save my PC pin 4821', true],
  ['save password for gmail username ede password summer2026', true], ['save my locker code 1234', true],
] as [string, boolean][]) {
  const d = parsePrivateSave(q);
  t(!!d && draftHasSecret(d) === secret, `${secret ? 'warn' : 'no warning'}: ${JSON.stringify(q)} → ${JSON.stringify(d && { kind: d.kind, password: d.password, content: d.content })}`);
}
process.exit(bad ? 1 : 0);
