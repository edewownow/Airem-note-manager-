/**
 * AboutScreen — the standalone "what is this app" surface, opened by tapping the
 * M monogram in the main header. NOT navigation: a conditional full-screen render
 * that takes over the screen with a back-out, same pattern as FolderScreen
 * (invariant 7 — no nav lib). Holds the app overview, the version line + What's
 * new list (relocated out of Settings, where it was a category mismatch), and the
 * developer credit. Settings keeps the key/model + voice picker.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, StatusBar as RNStatusBar } from 'react-native';
import { colors } from '../theme/tokens';
import { fonts } from '../theme/typography';
import { Icon } from './common/Icon';
import { APP_VERSION, APP_BUILD, WHATS_NEW } from '../lib/version';
import { NoticesScreen } from './NoticesScreen';

// Each ability: a bold lead phrase + the rest of the line (joined with an em dash). The first six are
// the original source copy, verbatim; voice.35 added the rest for the voice / Private-folder round.
const ABILITIES: { lead: string; body: string }[] = [
  {
    lead: 'One mic for everything',
    body: 'tap the big mic and speak. Ask a question or say something to save — MemoAirem works out which, and asks you only when it isn’t sure.',
  },
  {
    lead: 'Ask out loud, hear it back',
    body: 'ask MemoAirem a question by voice, and it reads the answer back to you. Hands-free recall. When Gemma is loaded, you still see today’s answer at once, then hear Gemma’s sentence only if every fact in it is in those records. The Private folder is never read.',
  },
  {
    lead: 'Understands you without signal',
    body: 'a built-in listener (Parakeet) runs on the phone, with a background-noise cleaner. It takes over when Google can’t, or does all the listening in “Phone only” mode so your voice never leaves the phone.',
  },
  {
    lead: 'A voice of its own',
    body: 'answers can be spoken by a built-in voice (Kokoro) that works fully offline.',
  },
  {
    lead: 'Structured text input',
    body: 'type what you want to remember and MemoAirem shapes it into a tidy record: what, where, when, who. Easy to enter, easy to find later.',
  },
  {
    lead: 'Plans years ahead',
    body: 'say “March 5, 2028”, “5/3/2027” (day first), “next year” or “in 2 years” — the date is kept exactly as you said it.',
  },
  {
    lead: 'Smart parsing for real context',
    body: "it doesn't just store your words, it understands them — pulling out the details that make a record findable later.",
  },
  {
    lead: 'Snap & parse',
    body: 'take a snapshot of anything with information on it — a menu, a schedule, an invoice — and MemoAirem reads it with the Gemini AI and returns the data, ready to save.',
  },
  {
    lead: '🔒 Private folder',
    body: 'passwords, notes and documents — passport, seaman’s book, SRB, visas and every ID — encrypted on this phone and opened with your fingerprint or your own 6-digit PIN. A recovery key and an encrypted backup file mean you can’t be locked out — not even on a new phone. Documents keep their number, issue and expiry dates; anything expired or due within 6 months is flagged, and you can ask “when does my passport expire?”.',
  },
  {
    lead: 'Faithful by design',
    body: "captures only what's actually there. You stay in control of the details and can add more whenever you like.",
  },
  {
    lead: 'Yours, on your device',
    body: 'local-first storage, works offline, no accounts. Your data stays with you.',
  },
];

/**
 * Voice commands (1.10.13; rewritten voice.35) — the phrases MemoAirem listens for, grouped. Keep in
 * step with lib/command.ts (labels), lib/intent.ts (ask / save), lib/privateSearch.ts (Private
 * redirects / saves) and lib/query.ts (dates) — the source of truth; scripts/voice-corpus.ts,
 * private-asr-corpus.ts, intent-measure.ts and date-corpus.ts test them.
 */
const COMMANDS: { head: string; note?: string; lines: string[] }[] = [
  {
    head: 'One big mic — ask or save',
    note: 'A clear instruction is done at once. When MemoAirem isn’t sure, it shows Ask (left) and Save (right) — the filled one is its guess — with ⓧ in between to start over.',
    lines: [
      '“what’s on tomorrow?” · “do I have anything tonight?” · “today” — Ask',
      '“remind me to buy bread” · “dinner with Sam Friday at 7” · “Penfolds is 25 dollars” — Save',
      'Wrong guess? After a save tap “It was a question”; after an answer tap “Save it instead”.',
    ],
  },
  {
    head: 'Saving — what MemoAirem listens for',
    lines: [
      '“set schedule dentist Friday at 3” — schedule',
      '“remind me to buy bread” — reminder',
      '“note the wine list is on page 2” — note',
      'Say it without these and MemoAirem picks schedule, reminder or note for you.',
    ],
  },
  {
    head: 'Dates, even years ahead',
    lines: [
      '“remind me to renew my passport next year” · “… in 2 years” · “… in 6 months”',
      '“sign on in Miami on 3rd November 2027” · “on March 5, 2028” · “on 5/3/2027” (day first = 5 March)',
      '“in March next year” · “March 2028” — the 1st of that month',
      'Ask: “what’s next year?” · “what do I have in 2028?” · “what’s in March 2028?”',
    ],
  },
  {
    head: '🔒 Ask for something private',
    note: 'Opens the Private folder and asks for your fingerprint or PIN. Only the title is spoken — and, for expiry questions, the date. Never a number or password.',
    lines: [
      '“what is my SSS no.” — also TIN, PhilHealth, Pag-IBIG, Passport, UMID, National ID, PRC, driver’s license, seaman’s book, SRB, visa',
      '“what is my crew ID number” · “what is my S R B” — any card you saved, when your normal notes don’t have it',
      '“when does my passport expire?” · “is my visa expired?” · “which documents expire this year?”',
      '“what’s my gmail password” · “netflix password?” · “password search bank”',
      'Tips: add “ID” — “what is my PhilHealth ID”; the built-in listener hears the name better. If it misses “Pag-IBIG”, say “HDMF”.',
    ],
  },
  {
    head: 'Lists — just to look',
    note: 'Shows one kind of item, nothing is saved. Private lists open the Private folder (fingerprint or PIN) and speak titles only.',
    lines: [
      '“list all passwords” · “list all IDs” · “list all private notes” · “show everything private”',
      '“list all reminders” · “list all notes” · “list all schedules” · “list all my records”',
      'Also “show my …”, “what are my …”. Inside the Private folder, say them to the 🎙 by the search box.',
    ],
  },
  {
    head: 'Teach MemoAirem',
    note: 'It learns on this phone only — never anything private. See and undo it in Settings → Learning.',
    lines: [
      'Wrong guess? Tap “It was a question” or “Save it instead” — next time a sentence like it goes the right way at once.',
      '“when I say PH I mean PhilHealth” · “remember that crew bar means Crew Bar deck 4” — your own words',
      'A wrong word on the big mic? Tap Fix words, correct each word, then Save once. The list is Settings → Learning → Fixed on the mic. Next time that word means what you typed.',
      'Questions it couldn’t answer are listed in Settings → Learning → What MemoAirem missed — export it and send it to the developer.',
    ],
  },
  {
    head: '🔒 Save privately',
    note: 'Goes only to the Private folder — never Gemini, never Harbor, never read aloud. Said on the main mic while online, Google’s speech service hears it: for secrets, type them in the folder or use Phone only listening.',
    lines: [
      '“save my passport” · “save my SSS number” · “save my crew ID” · “my SSS number is 34-1234567-8” — a DOCUMENT; every ID is one (the number you say goes in No.)',
      '“save password for gmail username ede password …” · “save my PC pin” · “save my laptop password” — a password',
      '“save my locker code 1234” · “save my wifi” · “private note …” — a note',
    ],
  },
  {
    head: 'Inside the Private folder',
    lines: [
      'Opens with your fingerprint or your MemoAirem PIN — not the phone’s PIN. Forgot it? Your secret question (your name, e-mail and the answer) or your recovery key opens it — then choose a new PIN.',
      'Security & backup: fingerprint on/off, secret question, change PIN, new recovery key, make a backup file, add from a backup. On a new phone: Restore from a backup file.',
      'Fill passwords in other apps (Android 8+): Security & backup → Choose MemoAirem for autofill; tap a login box → Unlock to fill → fingerprint or PIN (shown only where a login is saved). Logins fill only on the website saved with them. Works in Chrome and in other browsers (Edge, Samsung Internet, Opera, Firefox, Brave). New-password boxes offer a strong password.',
      'Moving from Google Password Manager: export your passwords there, then Security & backup → Import from Google Password Manager — and delete the exported file.',
      '+ Password · + Note · + Document. Documents: name, No., date issued, date expired (day first: 5/3/2027), place of issue, notes, photo.',
      'Documents are listed soonest expiry first; expired ones show red, those due within 6 months amber.',
      'An older note? Tap “Make it a document” — it moves over with its photo; just add the dates.',
      'Tap 🎙 by the search box and say the label — “SSS”, “netflix”.',
    ],
  },
  {
    head: 'Without signal',
    lines: [
      'Settings → Listening → download Parakeet: it understands you offline and whenever Google fails.',
      '“🔒 Phone only (private)” — only the built-in listener; your voice never leaves the phone.',
      'Settings → Voice → Built-in (Kokoro) speaks answers with no signal.',
    ],
  },
  {
    head: 'These stay normal on purpose',
    lines: [
      '“remind me to change my password” · “remind me to renew my visa” · “pay my SSS contribution on the 10th”',
      '“my passport expires in March” — a statement is saved as a note; ask “when does my passport expire?” for the Private folder',
    ],
  },
];

export function AboutScreen({ onBack }: { onBack: () => void }) {
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [noticesOpen, setNoticesOpen] = useState(false);

  if (noticesOpen) return <NoticesScreen onBack={() => setNoticesOpen(false)} />;

  return (
    <View style={[styles.screen, { paddingTop: RNStatusBar.currentHeight ?? 0 }]}>
      <View style={styles.head}>
        <Pressable style={styles.back} onPress={onBack} hitSlop={8}>
          <Icon name="back" size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.headTitle}>About</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.appName}>MemoAirem</Text>
        <Text style={styles.tagline}>Capture anything. Find it later — even offline.</Text>

        <Text style={styles.intro}>
          MemoAirem turns your voice, photos, files and quick notes into clean, searchable records you
          keep on your own device — no account, and most of it works offline.
        </Text>

        <Text style={styles.sectionLbl}>What it does</Text>
        <View style={styles.abilities}>
          {ABILITIES.map((a) => (
            <View key={a.lead} style={styles.ability}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.abilityText}>
                <Text style={styles.abilityLead}>{a.lead}</Text> — {a.body}
              </Text>
            </View>
          ))}
        </View>

        {/* voice commands — collapsed by default, like What's new */}
        <View style={styles.divider} />
        <Pressable style={styles.whatsNewToggle} onPress={() => setCommandsOpen((o) => !o)} hitSlop={6}>
          <Text style={styles.whatsNewLbl}>Voice commands</Text>
          <View style={{ transform: [{ rotate: commandsOpen ? '180deg' : '0deg' }] }}>
            <Icon name="chevron" size={16} color={colors.muted} />
          </View>
        </Pressable>
        {commandsOpen
          ? COMMANDS.map((g) => (
              <View key={g.head} style={styles.cmdBlock}>
                <Text style={styles.cmdHead}>{g.head}</Text>
                {g.note ? <Text style={styles.cmdNote}>{g.note}</Text> : null}
                {g.lines.map((line, i) => (
                  <Text key={i} style={styles.cmdLine}>
                    • {line}
                  </Text>
                ))}
              </View>
            ))
          : null}

        {/* version + What's new — relocated as-is from Settings */}
        <View style={styles.divider} />
        <Text style={styles.version}>
          MemoAirem v{APP_VERSION} · build {APP_BUILD}
        </Text>
        <Pressable style={styles.whatsNewToggle} onPress={() => setWhatsNewOpen((o) => !o)} hitSlop={6}>
          <Text style={styles.whatsNewLbl}>What’s new</Text>
          <View style={{ transform: [{ rotate: whatsNewOpen ? '180deg' : '0deg' }] }}>
            <Icon name="chevron" size={16} color={colors.muted} />
          </View>
        </Pressable>
        {whatsNewOpen
          ? WHATS_NEW.map((rel) => (
              <View key={rel.version} style={styles.relBlock}>
                <Text style={styles.relVer}>v{rel.version}</Text>
                {rel.lines.map((line, i) => (
                  <Text key={i} style={styles.relLine}>
                    • {line}
                  </Text>
                ))}
              </View>
            ))
          : null}

        <View style={styles.divider} />
        <Pressable
          style={styles.whatsNewToggle}
          onPress={() => setNoticesOpen(true)}
          hitSlop={6}
          accessibilityLabel="Open-source notices"
        >
          <Text style={styles.whatsNewLbl}>Open-source notices</Text>
          <View style={{ transform: [{ rotate: '-90deg' }] }}>
            <Icon name="chevron" size={16} color={colors.muted} />
          </View>
        </Pressable>

        <View style={styles.divider} />
        <Text style={styles.credit}>Developed by: Edwin Vallejos</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.canvas },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  back: { padding: 4 },
  headTitle: { fontFamily: fonts.groteskSemi, fontSize: 17, color: colors.ink },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 44 },
  appName: { fontFamily: fonts.groteskSemi, fontSize: 26, color: colors.ink },
  tagline: { fontFamily: fonts.inter, fontSize: 14.5, color: colors.primary, marginTop: 4 },
  intro: { fontFamily: fonts.inter, fontSize: 14, color: colors.ink, lineHeight: 21, marginTop: 16 },
  sectionLbl: { fontFamily: fonts.groteskSemi, fontSize: 14, color: colors.ink, marginTop: 22, marginBottom: 10 },
  abilities: { gap: 12 },
  ability: { flexDirection: 'row', gap: 8 },
  bullet: { fontFamily: fonts.inter, fontSize: 14, color: colors.primary, lineHeight: 21 },
  abilityText: { flex: 1, fontFamily: fonts.inter, fontSize: 13.5, color: colors.muted, lineHeight: 21 },
  abilityLead: { fontFamily: fonts.interSemi, color: colors.ink },
  divider: { height: 1, backgroundColor: colors.line, marginTop: 22, marginBottom: 14 },
  version: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.muted },
  whatsNewToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  whatsNewLbl: { fontFamily: fonts.interSemi, fontSize: 13, color: colors.ink },
  relBlock: { marginTop: 8, gap: 3 },
  relVer: { fontFamily: fonts.mono, fontSize: 11, color: colors.primary },
  relLine: { fontFamily: fonts.inter, fontSize: 12, color: colors.muted, lineHeight: 17 },
  credit: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
  cmdBlock: { marginTop: 12, gap: 4 },
  cmdHead: { fontFamily: fonts.interSemi, fontSize: 13, color: colors.ink },
  cmdNote: { fontFamily: fonts.inter, fontSize: 12, color: colors.primaryInk, lineHeight: 17 },
  cmdLine: { fontFamily: fonts.inter, fontSize: 12.5, color: colors.muted, lineHeight: 18 },
});
