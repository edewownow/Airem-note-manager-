/**
 * 2.0.0: "list all …" voice commands (lib/listCommands.ts) — run after ANY change there or to the
 * intent rules:  npx esbuild scripts/list-commands.ts --bundle --platform=node --outfile=scripts/.lc.js && node scripts/.lc.js
 */
import { parseListAll } from '../src/lib/listCommands';
import { classifyIntent } from '../src/lib/intent';
import { parsePrivateSave } from '../src/lib/privateSearch';

let bad = 0;
const ok = (c: boolean, m: string) => { if (!c) { bad++; console.log('✗', m); } };
const want: [string, string | null][] = [
  ['list all passwords', 'private:password'], ['List all my passwords.', 'private:password'], ['show my passwords', 'private:password'],
  ['show me all my passwords', 'private:password'], ['what are my passwords', 'private:password'], ['all my passwords', 'private:password'],
  ['list all my logins', 'private:password'], ['show all accounts', 'private:password'], ['list all password', 'private:password'],
  ['list all pass words', 'private:password'], ['okay list all my passwords please', 'private:password'], ['show my saved passwords', 'private:password'],
  ['list all IDs', 'private:id'], ["list all ID's", 'private:id'], ['list all I.D.s', 'private:id'], ["list all I'd", 'private:id'],
  ["list all I'ds", 'private:id'], ['list all ids', 'private:id'], ['show all my IDs', 'private:id'], ['show my ID cards', 'private:id'],
  ['list all my documents', 'private:doc'], ['show my documents', 'private:doc'], ['list all cards', 'private:id'], ['what are my IDs', 'private:id'],
  ['what is my id', 'private:id'], ["what's my ID", 'private:id'], ['what is my identification', 'private:id'],
  ['list all visas', 'private:visa'], ['show my passports', 'private:passport'], ['list all training certificates', 'private:training'],
  ['what is my certificate', 'private:training'], ['list all certs', 'private:training'],
  ['what is my training certificate', 'private:training'], ['what is my passport', null], ['what is my visa', null],
  ['list all private notes', 'private:note'], ['show my secret notes', 'private:note'],
  ['show everything private', 'private:all'], ['list all private items', 'private:all'], ['open my private folder', 'private:all'],
  ['list all reminders', 'records:reminder'], ['show my reminders', 'records:reminder'], ['list all my to-dos', 'records:reminder'],
  ['list all schedules', 'records:event'], ['show all my appointments', 'records:event'], ['list all events', 'records:event'],
  ['list all notes', 'records:note'], ['show my notes', 'records:note'], ['list all my records', 'records:all'], ['show everything', 'records:all'],
  ['list everything i saved', 'records:all'],
  // every verb means the same (user: "list, show, view — will it trigger the same command")
  ['view all passwords', 'private:password'], ['display my IDs', 'private:id'], ['find all my passwords', 'private:password'],
  ['search my private notes', 'private:note'], ['get all my reminders', 'records:reminder'], ['check my notes', 'records:note'],
  ['see all my schedules', 'records:event'], ['pull up my passwords', 'private:password'], ['look up all my IDs', 'private:id'],
  // NOT list commands — must stay what they were
  ['what is my gmail password', null], ['what is my meeting', null], ['save my passport number 123', null], ['remind me to call mom', null],
  ['list of things to buy milk eggs', null], ['show me the menu from dinner', null], ['my passport expires in 2030', null],
  ['note buy milk', null], ['what is on today', null], ['all hands meeting at 3 pm tomorrow', null], ['show my password for gmail', null],
  ['list the passwords for bank', null], ['find my password for gmail', null], ['find my passport', null],
  ['search gmail password', null], ['check the weather tomorrow', null], ['get milk and eggs', null], ['take a note list all the stuff', null],
];
for (const [q, w] of want) {
  const r = parseListAll(q);
  const got = r ? `${r.where}:${r.where === 'private' ? r.kind : r.type}` : null;
  ok(got === w, `${JSON.stringify(q)} → ${got} (want ${w})`);
  if (w) {
    ok(classifyIntent(q).intent === 'ask' && classifyIntent(q).sure, `${JSON.stringify(q)} must be a SURE ask (${JSON.stringify(classifyIntent(q))})`);
    ok(parsePrivateSave(q) === null, `${JSON.stringify(q)} must never be a private save`);
  }
}
console.log(bad ? `${bad} list-command checks FAILED` : `all ${want.length} list-command phrases right`);
process.exitCode = bad ? 1 : 0;

// the records side: runQuery lists by TYPE (not by the words)
import { localEngine } from '../src/lib/query';
import { spokenReply } from '../src/lib/voice';
const recs: any[] = [
  { id: '1', type: 'reminder', title: 'Buy bread', date: null, time: null, location: null, people: null, notes: null, via: 'Voice command', imageId: null, thumb: null },
  { id: '2', type: 'event', title: 'Dentist', date: '2020-01-01', time: '15:00', location: null, people: null, notes: null, via: 'x', imageId: null, thumb: null },
  { id: '3', type: 'event', title: 'Dinner', date: '2099-01-01', time: null, location: null, people: null, notes: null, via: 'x', imageId: null, thumb: null },
  { id: '4', type: 'note', title: 'Wine list page 2', date: null, time: null, location: null, people: null, notes: null, via: 'x', imageId: null, thumb: null },
  { id: '5', type: 'menu', title: 'Penfolds', date: null, time: null, location: null, people: null, notes: '25 dollars', via: 'x', imageId: null, thumb: null },
];
const t = (q: string) => localEngine.run(recs, q).results.map((r) => r.id).join(',');
ok(t('list all reminders') === '1', 'reminders → the reminder (it never says "reminder")');
ok(t('list all schedules') === '2,3', 'schedules → past AND future events, in date order: ' + t('list all schedules'));
ok(t('list all notes') === '4', 'notes → the note only');
ok(t('list all my records').split(',').length === 5, 'everything → all 5');
ok(spokenReply(localEngine.run([], 'list all reminders')) === 'No reminders saved yet.', 'empty list is said plainly: ' + spokenReply(localEngine.run([], 'list all reminders')));
console.log(bad ? `${bad} checks FAILED (incl. records)` : 'records listing right');
process.exitCode = bad ? 1 : 0;
