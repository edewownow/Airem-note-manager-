/**
 * 2.0.0 build 97 — MemoAirem learning from you (lib/learning.ts + its hooks in lib/intent.ts). Run:
 *   npx esbuild scripts/learning-sim.ts --bundle --platform=node --outfile=scripts/.ls.js \
 *     --alias:react-native-mmkv=./scripts/vault-sim/mocks/mmkv.ts --alias:expo=./scripts/vault-sim/mocks/expo.ts && node scripts/.ls.js
 */
import * as L from '../src/lib/learning';
import { listenHints, shapeHeard } from '../src/lib/hear';
import { classifyIntent } from '../src/lib/intent';
import { parsePrivateSearch } from '../src/lib/privateSearch';

let bad = 0;
let good = 0;
const ok = (c: any, m: string) => { if (c) good++; else { bad++; console.log('✗', m); } };
L.forgetAllLearning();

console.log('— 1. lessons from corrections —');
ok(L.shapeOf('Activities on Friday') === L.shapeOf('activities tomorrow'), 'shape: any day is the same ("activities <day>") — ' + L.shapeOf('Activities on Friday'));
ok(L.shapeOf('dinner with Sam at 7pm') === L.shapeOf('dinner with Sam at 8:30 pm'), 'shape: any time is the same');
ok(L.shapeOf('flight home') !== L.shapeOf('flight to Rome'), 'different words stay different');
const before = classifyIntent('flight home');
ok(before.intent === 'save' || !before.sure, 'before: "flight home" is not a sure question (' + JSON.stringify(before) + ')');
ok(L.learnIntent('flight home', 'ask'), 'tapping "It was a question" teaches it');
ok(JSON.stringify(classifyIntent('flight home')) === '{"intent":"ask","sure":true}', 'after: "flight home" is answered at once');
ok(JSON.stringify(classifyIntent('Flight home?')) === '{"intent":"ask","sure":true}', '…any case / punctuation');
L.learnIntent('gala dinner tomorrow', 'ask');
ok(JSON.stringify(classifyIntent('gala dinner on Saturday')) === '{"intent":"ask","sure":true}', 'one lesson covers another day ("gala dinner <day>")');
ok(classifyIntent('gala dinner with the captain on Saturday').intent === classifyIntent('gala dinner with the captain on Saturday').intent, 'a different sentence keeps the normal rules');
L.learnIntent('what time is checkout', 'save');
ok(JSON.stringify(classifyIntent('what time is checkout')) === '{"intent":"save","sure":true}', '"Save it instead" teaches a save — even over a question word');
L.learnIntent('what time is checkout', 'ask');
ok(classifyIntent('what time is checkout').intent === 'ask' && L.listLessons().filter((l) => l.shape === L.shapeOf('what time is checkout')).length === 1, 'corrected again → the newer lesson replaces it');
L.forgetLesson(L.shapeOf('flight home'));
ok(L.learnedIntent('flight home') === null, 'a lesson can be removed (Settings)');

console.log('— never private —');
ok(!L.learnIntent('my gmail password is summer2026', 'save'), 'a password sentence is never learned');
ok(!L.learnIntent('what is my SSS number', 'ask'), 'an ID question is never learned');
ok(!L.learnIntent('call 0917 555 1234 tomorrow', 'save'), 'a long number is never learned');
ok(!L.noteMiss('show my passport', 'no-answer'), 'never in the missed list either');
ok(L.listLessons().every((l) => !/password|sss|0917/i.test(l.example)), 'nothing private in the lessons');
L.learnIntent('save my laptop', 'ask'); // even if somebody taught it, private rules come first
ok(classifyIntent('what is my gmail password').intent === 'ask' && parsePrivateSearch('what is my gmail password') !== null, 'the private-folder rules always win');

console.log('— 2. my words —');
ok(L.parseTeach('when I say PH I mean PhilHealth')?.say === 'PH' && L.parseTeach('when I say PH I mean PhilHealth')?.mean === 'PhilHealth', 'teach by voice: "when I say PH I mean PhilHealth"');
ok(L.parseTeach('remember that crew bar means Crew Bar deck 4')?.mean === 'Crew Bar deck 4', '"remember that X means Y"');
ok(L.parseTeach('what PH means') === null && L.parseTeach('this means war') === null, 'ordinary sentences are not teaching');
ok(JSON.stringify(classifyIntent('when I say PH I mean PhilHealth')) === '{"intent":"ask","sure":true}', 'teaching is never saved as a note');
ok(L.setWord('PH', 'PhilHealth') === null, 'saved');
ok(L.setWord('dek', 'deck', Date.now(), 'mic') === null && L.listMicWords().some((w) => w.say === 'dek' && w.mean === 'deck'), 'a mic fix is listed on its own');
ok(L.expandWords('what is my PH number') === 'what is my PhilHealth number', 'understood: "my PH number" → PhilHealth');
ok(L.replaceWordAt('set schedule for dek four', 3, 'deck') === 'set schedule for deck four', 'one wrong word replaced, the rest kept');
ok(L.replaceWordAt('set schedule for dek four', 4, '') === 'set schedule for dek', 'a blank fix drops only that extra word');
ok(L.expandWords('PHONE bill') === 'PHONE bill' && L.expandWords('alpha') === 'alpha', 'whole words only (PHONE, alpha untouched)');
const hints = listenHints(
  [
    { type: 'note', title: 'Locker on deck 4', location: 'Crew bar', people: 'Sam' },
    { type: 'private', title: 'Gmail password', location: null, people: null },
  ],
  ['deck'],
);
ok(hints.includes('deck') && hints.includes('Sam') && hints.includes('Crew bar') && !hints.some((h) => /password/i.test(h)), 'the listener is told your words, not a private title');
ok(shapeHeard(['when is the duck', 'when is the deck'], hints) === 'when is the deck', 'the guess that matches a saved word wins');
ok(shapeHeard(['the locker is on duck 4'], hints) === 'the locker is on deck 4', 'one letter off a saved word is snapped to it');
ok(shapeHeard(['when is the meeting', 'when is my schedule'], ['meeting']) === 'when is the meeting', 'a tied or weaker guess stays the first one');
L.setWord('wen', 'when');
ok(JSON.stringify(classifyIntent('wen is the meeting')) === '{"intent":"ask","sure":true}', 'a corrected word is applied before a question is guessed');
L.removeWord('wen');
ok(parsePrivateSearch(L.expandWords('what is my ph no')) !== null, 'so the private folder finds "PhilHealth" from "PH"');
L.setWord('crew bar', 'Crew Bar deck 4');
ok(L.expandWords('drinks at the crew bar tonight') === 'drinks at the Crew Bar deck 4 tonight', 'phrases too, any case');
ok(L.setWord('x', '12345678') !== null, 'no long numbers in my words');
L.setWord('PH', 'Philippines');
ok(L.listWords().filter((w) => w.say === 'PH').length === 1 && L.expandWords('PH') === 'Philippines', 'setting a word again changes it');
L.removeWord('ph');
ok(L.expandWords('PH') === 'PH', 'removed');

console.log('— 3. what it missed —');
L.clearMisses();
L.noteMiss('what activities I have today', 'no-answer');
L.noteMiss('flight home', 'was-question');
L.noteMiss('flight home', 'was-question');
ok(L.listMisses().length === 2, 'kept, repeats once');
const rep = L.missesReport('2.0.0');
ok(rep.includes('NO ANSWER\twhat activities I have today') && rep.includes('WAS A QUESTION') && rep.includes('MY WORDS'), 'export file readable');
L.clearMisses();
ok(L.listMisses().length === 0, 'cleared');
L.forgetAllLearning();
ok(!L.listLessons().length && !L.listWords().length, 'forget everything');

console.log(bad ? `${bad} of ${good + bad} learning checks FAILED` : `all ${good} learning checks pass`);
process.exitCode = bad ? 1 : 0;
