/**
 * 2.0.0 build 99 (user: "saving note like meeting on saturday 1 pm is not indexed — when is the meeting can't find it").
 * Run after query.ts / command.ts changes:
 *   npx esbuild scripts/meeting-answer.ts --bundle --platform=node --outfile=scripts/.ma.js --alias:react-native-mmkv=./scripts/vault-sim/mocks/mmkv.ts --alias:expo=./scripts/vault-sim/mocks/expo.ts && node scripts/.ma.js
 * (the clock is fixed to Thu 29 Oct 2026 by ./fixed-clock, so the fixed-date checks stay valid.)
 */
import './fixed-clock';
import { inferVoiceCommand, parseVoiceCommand, sameSaveShape, voiceSaveShape } from '../src/lib/command';
import { clearFollowUp, continueQuestion, rememberQuestion } from '../src/lib/followUp';
import { learnRecord, removeWord, setWord } from '../src/lib/learning';
import { localEngine, parseWhen } from '../src/lib/query';
import { spokenReply } from '../src/lib/voice';
import { parsePrivateSave } from '../src/lib/privateSearch';
let bad=0; const ok=(c:boolean,m:string)=>{ if(!c){bad++;console.log('✗',m);} else console.log('✓',m); };
const base = (o:any)=>({ id:'e'+Math.random(), type:'note', title:'x', date:null, time:null, location:null, people:null, notes:null, via:null, imageId:null, thumb:null, ...o });
const save = (said:string) => { const c = parseVoiceCommand(said) ?? inferVoiceCommand(said); const {date,time}=parseWhen(c.fields.when); return base({type:c.kind,title:c.fields.what,date,time,location:c.fields.where||null,people:c.fields.who||null}); };
const others = [base({type:'event',title:'Dentist',date:'2026-10-30',time:'09:00'}), base({type:'note',title:'Buy bread'}), base({type:'reminder',title:'Call mom',date:'2026-11-02'}), base({type:'event',title:'Crew drill',date:'2026-11-03',time:'10:00'})];
for (const said of ['note meeting on saturday 1 pm','meeting on saturday 1 pm','take a note meeting with Sam on Saturday at 1 pm','note the wifi password is on the fridge','note great sunset today','set appointment dentist friday 9am']) {
  const r = save(said); console.log('  save', JSON.stringify(said), '→', r.type, JSON.stringify(r.title), r.date, r.time);
}
const n = save('note meeting on saturday 1 pm');
ok(n.date==='2026-10-31' && n.time==='13:00' && n.type==='note' && /saturday 1 pm/i.test(n.title), 'note keeps its words AND gets Sat 13:00');
ok(save('note great sunset today').date===null, 'note "today" alone gets no date (as before)');
for (const rec of [n, save('meeting on saturday 1 pm')]) {
 const set=[...others, rec];
 for (const q of ['when is the meeting','when is my meeting','what time is the meeting','when is the meeting on saturday','where is the meeting']) {
  const r = localEngine.run(set as any, q); const sp=spokenReply(r);
  console.log('   ', q, '→', sp);
  if (!/where/.test(q)) ok(/meeting/i.test(sp) && /saturday/i.test(sp), `${rec.type}: "${q}" answers the meeting`);
 }
}
// no regressions: plain schedule questions still list everything
const set=[...others, n];
ok(localEngine.run(set as any,'any meetings this week').results.length>=1, 'any meetings this week still finds');
{
  const work = base({ type: 'event', title: 'Schedule work', date: '2026-12-01', time: '09:00' });
  const miss = localEngine.run([work] as any, 'when is the meeting');
  const said = spokenReply(miss);
  ok(miss.results.length === 0 && !/schedule work/i.test(said) && /meeting/i.test(said), 'no meeting does not answer with the work schedule');
}
ok(localEngine.run(others as any,'when is my appointment').results.length===0, 'no appointment does not answer with other events');
ok(localEngine.run(set as any,'what activities I have today').interpText.includes('today'), 'activities today unchanged');
ok(localEngine.run(others as any,'what is my id').results.length===0, 'a question with no exact word does not open every saved record');
ok(localEngine.run(set as any,"what's my schedule").results.length>=1, 'a schedule question still lists');
// build 99 (user: "take note / set schedule / make appointment / remind me are the instruction —
// not the content"): the command words never end up in what is saved, and a title is never empty
const cmdWant: [string, string, string][] = [
  ['take note meeting on Saturday 1 pm', 'note', 'Meeting on Saturday 1 pm'],
  ['take notes the wifi code is on the fridge', 'note', 'The wifi code is on the fridge'],
  ['take a note meeting on saturday', 'note', 'Meeting on saturday'],
  ['make a note buy shoes', 'note', 'Buy shoes'],
  ['save a note gate 12', 'note', 'Gate 12'],
  ['write a note pick up laundry', 'note', 'Pick up laundry'],
  ['write down the gate number is 12', 'note', 'The gate number is 12'],
  ['jot down call Sam', 'note', 'Call Sam'],
  ['note to self buy milk', 'note', 'Buy milk'],
  ['set schedule dentist Friday 9am', 'event', 'Dentist'],
  ['make appointment dentist Friday 9am', 'event', 'Dentist'],
  ['book an appointment haircut Sunday 2pm', 'event', 'Haircut'],
  ['put on my schedule dentist friday 9am', 'event', 'Dentist'],
  ['set a meeting Friday 2pm', 'event', 'Meeting'],
  ['make an appointment with the doctor Monday 10am', 'event', 'Appointment'],
  ['remind me to call mom tomorrow', 'reminder', 'Call mom'],
  ['set a reminder to pay rent Friday', 'reminder', 'Pay rent'],
];
for (const [said, kind, title] of cmdWant) {
  const r = save(said);
  ok(r.type === kind && r.title === title, `"${said}" → ${kind} "${title}" (got ${r.type} "${r.title}")`);
}
// build 99 (user: "take note. the WIFI password is printed on the bulletin board" opened the Private
// folder): WHERE a password is, or what happened to it, is a normal note — a real value stays private
const privWant: [string, boolean][] = [
  ['take note. the WIFI password is printed on the bulletin board', false],
  ['the wifi password is on the fridge', false],
  ['note the crew wifi password is the same as last year', false],
  ['my email password was changed yesterday', false],
  ['remind me to change my password', false],
  ['the wifi password is crew2026', true],
  ['take note the wifi password is crew2026', true],
  ['wifi password: Sunset99', true],
  ['the safe pin is 4471', true],
  ['the password is new2026', true],
  ['the wifi password is Ocean', true],
  ['save my wifi password crew2026', true],
];
for (const [said, priv] of privWant) ok(!!parsePrivateSave(said) === priv, `"${said}" → ${priv ? 'Private folder' : 'normal note'}`);
// build 99 (user: "take a note, there are two chicken on the fridge" — "where is the chicken" found nothing)
{
  const chick = save('take a note . there are two chicken on the fridge');
  const set2 = [chick, base({ type: 'event', title: 'Meeting', date: '2099-10-31', time: '13:00' }), base({ type: 'event', title: 'Crew party', date: '2099-11-01', location: 'Crew bar' }), base({ title: 'Buy chicken' })];
  const say = (q: string) => spokenReply(localEngine.run(set2 as any, q));
  ok(/two chicken on the fridge/.test(say('where is the chicken')), 'where is the chicken → the note itself');
  ok(/two chicken on the fridge/.test(say('where are the chickens')), 'chickens finds chicken');
  ok(/^Meeting has no place saved/.test(say('where is the meeting')), 'where is the meeting → the meeting (not the party)');
  ok(/Crew party is in Crew bar/.test(say('where is the party')), 'where is the party → its place');
  ok(/couldn.t find anything about passport/.test(say('where is my passport')), 'nothing saved → still says so');
}
// build 99 (user: "seem notes are not being indexed"): questions about NOTES — a note's own words answer
{
  const notes = ['take a note there are two chicken on the fridge', 'take note the wifi password is printed on the bulletin board', 'note the spare key is under the mat', 'note Sam owes me 20 dollars', 'note my locker is number 12 on deck 4', 'note the gym opens at 6 am', 'note meeting on saturday 1 pm'].map(save);
  ok(notes[5].date === null && notes[5].time === '06:00', 'note with a time only: no day added (got ' + notes[5].date + ')');
  const want: [string, RegExp][] = [
    ['how many chicken', /^There are two chicken on the fridge\.$/],
    ['what is on the fridge', /two chicken on the fridge/],
    ['what is in the fridge', /two chicken on the fridge/],
    ['where is the key', /^The spare key is under the mat\.$/],
    ['where is the wifi password', /printed on the bulletin board/],
    ['how much does Sam owe me', /^Sam owes me 20 dollars\.$/],
    ['who owes me money', /^Sam owes me 20 dollars\.$/],
    ['where is my locker', /^My locker is number 12 on deck 4\.$/],
    ['what time does the gym open', /^The gym opens at 6 am\.$/],
    ['when does the gym open', /^The gym opens at 6 am\.$/],
    ['do I have chicken', /two chicken on the fridge\.$/],
    ['what notes do I have about Sam', /^I found one thing\. Sam owes me 20 dollars\.$/],
  ];
  for (const [q, re] of want) {
    const sp = spokenReply(localEngine.run(notes as any, q));
    ok(re.test(sp), `notes: "${q}" → ${sp}`);
  }
}
// "December the 6th" is how a birthday is said. It used to be saved with no date, so
// "what event do I have on dec 6" found nothing. "deck 4" must stay a place.
{
  const bday = save('george birthday on december the 6th');
  ok(bday.type === 'event' && bday.date === '2026-12-06' && bday.title === 'George birthday', 'december the 6th is a date (got ' + bday.type + ' ' + bday.date + ' ' + JSON.stringify(bday.title) + ')');
  const kept = base({ type: 'note', title: 'George birthday on december the 6th', date: null });
  const sp = spokenReply(localEngine.run([kept] as any, 'what event do I have on dec 6'));
  ok(/George birthday/.test(sp), 'a day said only in the title still answers that day → ' + sp);
  const deck = save('note my locker is number 12 on deck 4');
  ok(deck.date === null, 'deck 4 is not December 4');
  const deckFour = save('note my locker is number 12 on deck four');
  ok(deckFour.date === null, 'deck four is not December 4');
  // "schedule on dec 6" finds it. "what event on December 6th / sixth / the sixth of December"
  // used to miss it: the day word was also required in the title.
  const dated = base({ type: 'event', title: 'George birthday', date: '2026-12-06', time: null });
  for (const q of [
    'schedule on dec 6',
    'what event on december 6',
    'what event on december 6th',
    'what event on december sixth',
    'what event on december six',
    'what event on december the six',
    'what event on the sixth of december',
    'what event do I have on december 6',
  ]) {
    const sp = spokenReply(localEngine.run([dated] as any, q));
    ok(/George birthday/.test(sp), `"${q}" → ${sp}`);
  }
}
// The same instruction in other words: bday/birthday, appt/appointment. Training and drill stay different.
{
  const birthday = base({ type: 'event', title: 'George birthday', date: '2026-12-06', time: null });
  const saidBday = base({ type: 'event', title: 'George bday', date: '2026-12-06', time: null });
  const drill = base({ type: 'event', title: 'Crew drill', date: '2026-11-03', time: '10:00' });
  const training = base({ type: 'event', title: 'Safety training', date: '2026-11-04', time: '14:00' });
  const dentist = base({ type: 'event', title: 'Dentist appointment', date: '2026-10-30', time: '09:00' });
  const meeting = base({ type: 'event', title: 'Crew meeting', date: '2026-11-03', time: '10:00' });
  const doctor = base({ type: 'note', title: 'See the doctor Friday' });
  const document = base({ type: 'note', title: 'Sign the document' });
  const pairs: [string, any, RegExp][] = [
    ['when is the bday', birthday, /George birthday/],
    ['when is my birthday', saidBday, /George bday/],
    ['when is the meetup', meeting, /Crew meeting/],
    ['when is my dr', doctor, /doctor/i],
  ];
  for (const [q, rec, re] of pairs) {
    const sp = spokenReply(localEngine.run([rec, drill] as any, q));
    ok(re.test(sp), `synonym "${q}" → ${sp}`);
  }
  const appts = localEngine.run([dentist, drill] as any, 'when is my appt');
  ok(appts.results.length === 1 && /Dentist/.test(appts.results[0].title), 'appt means appointment');
  const trainAsk = localEngine.run([drill, training] as any, 'when is training');
  ok(trainAsk.results.length === 1 && /Safety training/.test(trainAsk.results[0].title), 'training does not mean drill');
  const drillAsk = localEngine.run([drill, training] as any, 'when is the drill');
  ok(drillAsk.results.length === 1 && /Crew drill/.test(drillAsk.results[0].title), 'drill does not mean training');
  const docs = localEngine.run([document, doctor] as any, 'when is my doc');
  ok(docs.results.some((r) => /document/i.test(r.title)) && docs.results.some((r) => /doctor/i.test(r.title)), 'doc means a document and a doctor');
  const doctorAsk = localEngine.run([document, doctor] as any, 'when is the doctor');
  ok(doctorAsk.results.length === 1 && /doctor/i.test(doctorAsk.results[0].title), 'doctor stays a doctor');
  const documentAsk = localEngine.run([document, doctor] as any, 'when is the document');
  ok(documentAsk.results.length === 1 && /document/i.test(documentAsk.results[0].title), 'document stays a document');
  const drOnly = localEngine.run([document] as any, 'when is my dr');
  ok(drOnly.results.length === 0, 'dr stays a doctor');
  const savedDoc = base({ type: 'note', title: 'Passport doc' });
  const findSaved = localEngine.run([savedDoc, doctor] as any, 'when is the document');
  ok(findSaved.results.length === 1 && /Passport doc/.test(findSaved.results[0].title), 'a saved doc answers a document question');
  const deckAsk = localEngine.run([birthday] as any, 'what is on the deck');
  ok(!deckAsk.results.some((r) => /birthday/i.test(r.title)), 'deck is not a word for a date');
  const booking = save('add a booking dentist friday 9am');
  ok(booking.type === 'event' && /dentist/i.test(booking.title), 'add a booking is a schedule → ' + booking.type + ' ' + booking.title);
  const task = save('set a task to buy milk');
  ok(task.type === 'reminder' && /buy milk/i.test(task.title), 'set a task is a reminder → ' + task.type + ' ' + task.title);
  const posted = parseVoiceCommand('task for the crew is posted');
  ok(posted === null, 'talking about a task is not the instruction');
  const when = new Date('2026-10-30T12:00:00');
  const wrongSave = voiceSaveShape('note meeting on saturday 1 pm', when);
  const rightSave = voiceSaveShape('note meeting on saturday 2 pm', when);
  ok(!!wrongSave && !!rightSave && !sameSaveShape(wrongSave, rightSave), 'a corrected time is a different save');
  ok(voiceSaveShape('when is the meeting', when) === null, 'a question is not a save');
  setWord('meaty', 'meeting');
  const heard = localEngine.run([n, ...others] as any, 'when is the meaty');
  ok(heard.results.some((r) => /meeting/i.test(r.title)), 'a question uses the corrected word before it searches');
  removeWord('meaty');
  ok(!!wrongSave && sameSaveShape(wrongSave, wrongSave), 'the same wrong save matches its copies');
  const meet = base({ type: 'event', title: 'Meeting with Sam', date: '2026-10-31', time: '13:00' });
  const near = localEngine.run([meet] as any, 'when is the meeting on the duck');
  ok(near.results.some((r) => /Meeting with Sam/.test(r.title)) && near.closest === 'duck', 'one leftover word still finds the meeting');
  const xyz = localEngine.run([meet] as any, 'when is the xyzzy');
  ok(xyz.results.length === 0, 'one unknown word with nothing to anchor it stays empty');
  learnRecord('when is the meaty', 'Meeting with Sam');
  const pointed = localEngine.run([meet] as any, 'when is the meaty');
  ok(pointed.results.some((r) => /Meeting with Sam/.test(r.title)), 'a pointed record answers that question next time');
  const tour = base({ type: 'note', title: 'Shore tour', notes: '40 dollars' });
  const taxi = base({ type: 'note', title: 'Taxi', notes: '15 dollars' });
  const total = localEngine.run([tour, taxi] as any, 'how much did the tour and the taxi cost');
  ok(/total is 55 dollars/i.test(spokenReply(total)), 'saved amounts are added → ' + spokenReply(total));
  ok(parseWhen('sat today').date === '2026-10-31', 'sat today is Saturday');
  clearFollowUp();
  rememberQuestion('when is the meeting');
  ok(continueQuestion('who is coming') === 'who is coming to the meeting', 'follow-up keeps the meeting');
  ok(/saturday/i.test(continueQuestion('and Saturday')), 'and Saturday stays on the meeting');
  clearFollowUp();
  ok(continueQuestion('who is coming') === 'who is coming', 'no memory, no follow-up');
}
console.log(bad?`${bad} FAIL`:'all pass');
