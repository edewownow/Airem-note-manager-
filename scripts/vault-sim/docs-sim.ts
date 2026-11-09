/**
 * Private DOCUMENTS simulation (1.12.0-voice.28) — run after ANY change to lib/privateDocs.ts or the
 * document parts of lib/vault.ts (same aliases as vault-sim.ts, see its header; this file instead).
 */
import * as V from '../../src/lib/vault';
import * as D from '../../src/lib/privateDocs';
import { docsForAsk, matchPrivate, matchPrivateBest, parseExpiryAsk } from '../../src/lib/privateSearch';
import { restartApp } from './mocks/mmkv';
import { openFolder } from './mocks/setup';
const ok = (c: any, m: string) => { console.log(c ? '✓' : '✗', m); if (!c) process.exitCode = 1; };
const today = new Date(2026, 9, 28); // 28 Oct 2026

// dates as typed (day first) — the year is required
ok(D.readDocDate('5/3/2027', today) === '2027-03-05', '5/3/2027 → 5 March 2027 (day first)');
ok(D.readDocDate('5 March 2027', today) === '2027-03-05' && D.readDocDate('March 5, 2027', today) === '2027-03-05', 'month names');
ok(D.readDocDate('2032-03-04', today) === '2032-03-04', 'ISO');
ok(D.readDocDate('5/3/32', today) === '2032-03-05', 'two-digit year');
ok(D.readDocDate('March 5', today) === null, 'no year → not accepted');
ok(D.readDocDate('next year', today) === null && D.readDocDate('in 2 years', today) === null, '"next year" / "in 2 years" → not a document date');
ok(D.readDocDate('31/2/2027', today) === null && D.readDocDate('renew 2027', today) === null, 'impossible dates / words → not accepted');

ok(['SSS', 'TIN', 'SID', 'PhilHealth', "Driver's license", 'Pag-IBIG', 'UMID', 'National ID', 'PRC license', 'Crew ID'].every((t) => D.docGroup(t) === 'id'), 'government and crew IDs are IDs');
ok(D.docGroup('MCV visa') === 'visa' && D.docGroup('Canadian visa') === 'visa', 'a visa stays a visa');
ok(D.docGroup('Passport') === 'passport' && D.docGroup('Canadian passport') === 'passport', 'a passport stays a passport');
ok(D.docGroup('BST training') === 'training' && D.docGroup('Medical certificate') === 'training', 'a training certificate is its own kind');
ok(D.docGroup("Seaman's book") === 'other' && D.docGroup('SRB') === 'other', "a seaman's book is not filed as an ID, a visa, or a passport");
const tagged = D.packDocNotes('2022-03-05', 'renew 6 months before', 'cert');
const unpacked = D.unpackDocNotes(tagged);
ok(unpacked.tag === 'cert' && unpacked.issued === '2022-03-05' && unpacked.notes === 'renew 6 months before', 'a cert tag is stored and the notes stay the notes');
ok(D.docKind('SSS', D.packDocNotes(null, '', 'cert')) === 'training', 'a cert tag wins over an ID title');
ok(D.docKind('SSS', D.packDocNotes(null, '', null)) === 'other', 'an explicit no-tag stays by itself');
ok(D.docKind('SSS', 'Issued: 2022-03-05') === 'id', 'an older document with no tag line still follows its title');
ok(D.suggestTag('SSS') === 'id' && D.suggestTag('Training certificate') === 'cert' && D.suggestTag("Seaman's book") === null, 'a quick name suggests ID, Cert, or no tag');
const taggedDoc = (id: string, title: string, notes: string | null) => ({ id, type: 'private-doc', title, date: '2030-01-01', time: null, location: null, people: 'SECRET', notes, via: 'x', imageId: null, thumb: null });
const taggedSet = [
  taggedDoc('bst', 'BST', D.packDocNotes(null, '', 'cert')),
  taggedDoc('med', 'Medical certificate', null),
  taggedDoc('sss', 'SSS', null),
  taggedDoc('mcv', 'MCV visa', null),
  taggedDoc('can', 'Canadian visa', null),
  taggedDoc('pp', 'Passport', D.packDocNotes(null, '', null)),
  taggedDoc('book', "Seaman's book", null),
];
const asked = (term: string) => docsForAsk(taggedSet as any, term).map((r) => r.title).sort().join(', ');
ok(asked('certificate') === 'BST, Medical certificate', 'a certificate question includes BST because it is tagged Cert');
ok(asked('BST') === 'BST', 'asking for BST still opens that document by name');
ok(asked('visa') === 'Canadian visa, MCV visa', 'a visa question stays on visas');
ok(asked('canadian visa') === 'Canadian visa', 'a named visa does not take the other visa');
ok(asked('ID') === 'SSS', 'an ID question stays on IDs');
ok(asked('passport') === '', 'a passport with the tag cleared stays out of the passport question');
ok(docsForAsk(taggedSet as any, '', true).some((r) => r.title === "Seaman's book"), 'which documents expire still includes the seaman’s book');
ok(parseExpiryAsk('when do my certificates expire')?.known === true && parseExpiryAsk('when does my BST expire')?.known === false, 'certificate opens the private folder; BST stays a name');
const certSaid = D.spokenExpiry(docsForAsk(taggedSet as any, 'certificates'), 'certificates', false, today);
ok(/BST/.test(certSaid) && /Tap the one you mean/.test(certSaid) && !/SECRET/.test(certSaid), `several certificates wait for a tap: "${certSaid}"`);

// expiry warning (inside the folder only)
ok(D.expiryStatus('2026-10-01', today)?.level === 'expired' && D.expiryStatus('2026-10-01', today)!.text === 'Expired 27 days ago', 'expired');
ok(D.expiryStatus('2027-02-01', today)?.level === 'soon' && D.expiryStatus('2027-02-01', today)!.text === 'Expires in 3 months', 'within 6 months → warning');
ok(D.expiryStatus('2028-03-05', today)?.level === 'ok' && D.expiryStatus('2028-03-05', today)!.text === 'Expires 5 Mar 2028', 'later → plain date');
ok(D.expiryStatus(null, today) === null, 'no expiry → nothing');

(async () => {
  await openFolder();
  const p = V.savePrivate({
    kind: 'doc', title: 'Passport', username: '', password: '',
    doc: { no: 'P1234567A', issued: '2022-03-05', expires: '2032-03-04', place: 'DFA Manila', notes: 'renew 6 months before' },
  })!;
  ok(p.type === D.PRIVATE_DOC_TYPE && V.isPrivateDoc(p), 'saved as a document');
  ok(p.title === 'Passport' && p.people === 'P1234567A' && p.date === '2032-03-04' && p.location === 'DFA Manila', 'name / No. / expiry / place in the fixed fields');
  ok(p.notes === 'Issued: 2022-03-05\nrenew 6 months before' && Object.keys(p).length === 11, 'issued + notes packed; record shape unchanged (11 fields)');
  const u = D.unpackDocNotes(p.notes);
  ok(u.issued === '2022-03-05' && u.notes === 'renew 6 months before', 'issued + notes unpack');
  const s = V.savePrivate({ kind: 'doc', title: "Seaman's book", username: '', password: '', doc: { no: 'SB-778', issued: null, expires: '2027-01-15', place: '', notes: '' } })!;
  ok(s.notes === null && s.location === null, 'empty issued / notes / place → null');
  const v = V.savePrivate({ kind: 'doc', title: 'US visa', username: '', password: '', doc: { no: '', issued: null, expires: null, place: '', notes: 'C1/D' } })!;
  // editing keeps it a document even if kind isn't passed
  const e = V.savePrivate({ title: 'US visa', username: '', password: '', doc: { no: 'V99', issued: null, expires: '2029-06-01', place: 'Manila', notes: 'C1/D' } }, v.id)!;
  ok(e.id === v.id && V.isPrivateDoc(e) && e.people === 'V99' && e.date === '2029-06-01', 'edit keeps it a document');
  V.savePrivate({ kind: 'note', title: 'SSS', username: '', password: '', content: '34-1234567-8' });
  V.lockVault(); restartApp(); await openFolder();
  const all = V.listPrivate();
  ok(all.filter(V.isPrivateDoc).length === 3 && all.some((r) => V.isPrivateNote(r) && r.title === 'SSS'), 'after restart: 3 documents + the note intact');
  const order = D.sortDocs(all.filter(V.isPrivateDoc)).map((r) => r.title);
  ok(JSON.stringify(order) === JSON.stringify(["Seaman's book", 'US visa', 'Passport']), `sorted by expiry: ${order.join(' → ')}`);
  ok(matchPrivate(all, 'passport').some((r) => r.id === p.id) && matchPrivate(all, 'seaman').some((r) => r.id === s.id), 'search finds documents by name');
  ok(V.savePrivate({ kind: 'doc', title: '', username: '', password: '', doc: { no: '', issued: null, expires: null, place: '', notes: '' } }) === null, 'an empty document is not saved');

  // voice.31 — "Make it a document": an older note turns into a document IN PLACE (same id, photo kept)
  const oldNote = V.savePrivate({ kind: 'note', title: 'Passport', username: '', password: '', content: 'P7654321B\nold note', photo: { base64: 'IMG', thumb: 'data:t' } })!;
  const conv = V.savePrivate({ kind: 'doc', title: 'Passport', username: '', password: '', doc: { no: 'P7654321B', issued: null, expires: '2031-01-01', place: '', notes: 'old note' } }, oldNote.id)!;
  ok(conv.id === oldNote.id && V.isPrivateDoc(conv) && !V.isPrivateNote(conv), 'note → document, same item');
  ok(conv.people === 'P7654321B' && conv.date === '2031-01-01' && conv.notes === 'old note' && conv.imageId === oldNote.imageId && V.privatePhoto(conv.imageId) !== null, 'number, date, notes moved; photo kept');
  ok(V.listPrivate().filter((r) => r.id === oldNote.id).length === 1, 'no duplicate left behind');
  V.removePrivate(conv.id);

  // voice.29 — what an expiry question SAYS: title + expiry date, never the number
  const docs = V.listPrivate().filter(V.isPrivateDoc);
  const pass = matchPrivate(docs, 'Passport', { titleOnly: true });
  const said = D.spokenExpiry(pass, 'Passport', false, today);
  ok(said === 'Your passport expires on 4 March 2032, in 5 years.', `passport: "${said}"`);
  ok(!said.includes('P1234567A'), 'the passport number is never said');
  const sb = D.spokenExpiry(matchPrivate(docs, "Seaman's book", { titleOnly: true }), "Seaman's book", false, today);
  ok(sb === "Your seaman's book expires on 15 January 2027, in 3 months.", `seaman's book: "${sb}"`);
  ok(D.spokenExpiry([], 'Visa', false, today) === "I couldn't find Visa in your documents.", 'not found');
  // voice.30 — IDs: only the exact one; a note (no expiry field) is explained
  const ids = [{ ...docs[0], id: 'c1', title: 'Crew ID', date: '2027-05-01' }, { ...docs[0], id: 'c2', title: 'Company ID', date: '2028-02-01' }];
  ok(JSON.stringify(matchPrivateBest(ids, 'crew ID').map((r) => r.title)) === '["Crew ID"]', '"crew ID" → only Crew ID, not Company ID');
  ok(matchPrivateBest(ids, 'ID').length === 2, '"ID" → both');
  const visas = [{ ...docs[0], id: 'v1', title: 'MCV visa', date: '2028-01-01' }, { ...docs[0], id: 'v2', title: 'Canadian visa', date: '2029-04-01' }];
  ok(JSON.stringify(matchPrivateBest(visas, 'canadian visa').map((r) => r.title)) === '["Canadian visa"]', 'canadian visa is not the MCV visa');
  ok(JSON.stringify(matchPrivateBest(visas, 'mcv visa').map((r) => r.title)) === '["MCV visa"]', 'MCV visa is that identifier');
  ok(JSON.stringify(matchPrivateBest(visas, 'maritime crew visa').map((r) => r.title)) === '["MCV visa"]', 'maritime crew visa is the MCV visa');
  ok(matchPrivateBest(visas.slice(0, 1), 'canadian visa').length === 0, 'the only other visa is not a substitute');
  ok(matchPrivateBest(visas, 'visa').length === 2, '"visa" alone still finds every visa');
  const many = D.spokenExpiry(visas, 'Visa', false, today);
  ok(/MCV visa/i.test(many) && /canadian visa/i.test(many) && /Tap the one you mean/.test(many) && !/SECRET|2028|2029/.test(many), `several visas are named for a tap: "${many}"`);
  ok(D.spokenExpiry([visas[0]], 'MCV visa', false, today).startsWith('Your MCV visa expires on'), 'one visa still says its date');
  const sss = V.listPrivate().find((r) => r.title === 'SSS')!;
  ok(D.spokenExpiry([], 'SSS', false, today, sss) === 'Your SSS is saved as a note, with no expiry date. Add it as a document to keep one.', 'SSS (a note) → explained');
  const allSaid = D.spokenExpiry(docs, '', true, today);
  ok(allSaid === "Your seaman's book expires on 15 January 2027, in 3 months.", `which documents expire: "${allSaid}"`);
  const old = { ...docs[0], title: 'Old ID', date: '2026-09-01', people: 'X1' };
  ok(D.spokenExpiry([old], 'Old ID', false, today) === 'Your old ID expired on 1 September 2026, 57 days ago.', 'expired is said in the past');
  const later = docs.filter((r) => r.title !== "Seaman's book");
  const nx = D.spokenExpiry(later, '', true, today);
  ok(nx === 'None of your documents expire in the next 6 months. The next to expire is your US visa, on 1 June 2029, in 2 years.', `nothing due → the next one: "${nx}"`);
})();
