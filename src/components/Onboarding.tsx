/**
 * Onboarding (1.13.0) — first-run setup, shown once (also once after updating from an older version).
 * The user's choices: name + e-mail, "profile only, stays on phone" — no account, no server — and
 * the 6-digit PIN protects the PRIVATE FOLDER only (the rest of the app opens freely, as before).
 *
 *   1. You       — name (required) + e-mail (optional, only a label)
 *   2. Private   — set up the folder (PIN + recovery key), restore a backup file, or later.
 *                  An old (1.10–1.12) folder: it asks for the PIN the next time it's opened.
 *   3. AI        — optional Gemini key (opens Settings when done), or skip
 *   4. Ready     — the first things to say
 * Full-screen conditional render (invariant 7, no nav lib).
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable, StatusBar as RNStatusBar, Image } from 'react-native';
import { colors, radius } from '../theme/tokens';
import { fonts } from '../theme/typography';
import { Button } from './common/Button';
import { VaultGate } from './vault/VaultGate';
import { emailLooksRight, firstName, getProfile, saveProfile } from '../lib/profile';
import { SetupDownloads, setupDownloadsVisible } from './common/SetupDownloads';
import { setupDownloadKind, startSetupDownloads, subscribeSetupDownloads } from '../lib/setupDownloads';
import { lockVault, vaultMode } from '../lib/vault';

type Step = 'you' | 'private' | 'ai' | 'ready';

export function Onboarding({ onFinish, hasAiKey }: { onFinish: (openSettings: boolean) => void; hasAiKey: boolean }) {
  const prior = getProfile();
  const [step, setStep] = useState<Step>('you');
  const [name, setName] = useState(prior?.name ?? '');
  const [email, setEmail] = useState(prior?.email ?? '');
  const [emailErr, setEmailErr] = useState(false);
  const [folderNote, setFolderNote] = useState<string | null>(null);
  const [wantsKey, setWantsKey] = useState(false);
  const authing = useRef(false);
  const picking = useRef(false);
  const guard = useRef({ authing, picking }).current;
  const mode = vaultMode();
  const [downloadKind, setDownloadKind] = useState(() => setupDownloadKind());

  useEffect(() => {
    startSetupDownloads();
    return subscribeSetupDownloads(() => setDownloadKind(setupDownloadKind()));
  }, []);

  const nextFromYou = () => {
    if (!emailLooksRight(email)) return setEmailErr(true);
    saveProfile({ name, email });
    setStep(mode === 'v3' ? (hasAiKey ? 'ready' : 'ai') : 'private');
  };
  const afterPrivate = () => setStep(hasAiKey ? 'ready' : 'ai');
  const dots = ['you', 'private', 'ai', 'ready'].filter((s) => (s !== 'private' || mode !== 'v3') && (s !== 'ai' || !hasAiKey));

  return (
    <View style={[styles.screen, { paddingTop: RNStatusBar.currentHeight ?? 0 }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <Image source={require('../../assets/memoairem-app-icon.png')} style={styles.badge} resizeMode="contain" />
          <View style={styles.dots}>
            {dots.map((s) => (
              <View key={s} style={[styles.dot, s === step && styles.dotOn]} />
            ))}
          </View>
          {setupDownloadsVisible(downloadKind) ? <SetupDownloads /> : null}
        </View>

        {step === 'you' ? (
          <View style={styles.box}>
            <Text style={styles.title}>Welcome to MemoAirem</Text>
            <Text style={styles.sub}>
              Your schedule, notes and documents — by voice, photo or text. Works without signal. Let’s set it up.
            </Text>
            <Text style={styles.label}>Your name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Ede"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              autoComplete="name"
              returnKeyType="next"
            />
            <Text style={styles.label}>E-mail (optional)</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setEmailErr(false);
              }}
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
            />
            {emailErr ? <Text style={styles.err}>That e-mail doesn’t look right.</Text> : null}
            <Text style={styles.small}>
              No account and no sign-up: your name and e-mail stay on this phone. They’re shown in the app and on your
              private backup file, so you know it’s yours. Nothing is sent to them.
            </Text>
            <Button label="Next" variant="primary" disabled={!name.trim()} onPress={nextFromYou} />
          </View>
        ) : step === 'private' ? (
          mode === 'legacy' ? (
            <View style={styles.box}>
              <Text style={styles.title}>Your private folder</Text>
              <Text style={styles.sub}>
                New: your own 6-digit PIN and a recovery key, so you can’t be locked out. Next time you open the private
                folder (🔒 at the bottom), unlock it once with your phone’s lock and set them up.
              </Text>
              <Button label="Next" variant="primary" onPress={afterPrivate} />
            </View>
          ) : (
            <View style={styles.box}>
              <Text style={styles.title}>Your private folder</Text>
              <Text style={styles.sub}>
                For passwords, ID numbers and documents — encrypted on this phone, locked with your PIN (and fingerprint).
                Never synced, never sent to AI.
              </Text>
              {folderNote ? <Text style={styles.ok}>{folderNote}</Text> : null}
              {folderNote ? (
                <Button label="Next" variant="primary" onPress={afterPrivate} />
              ) : (
                <>
                  <VaultGate
                    guard={guard}
                    autoStart={false}
                    onKeyLost={() => {}}
                    onOpened={(r, note) => {
                      lockVault(); // set up, not left open — the folder opens from its own screen
                      setFolderNote(r.ok ? note ?? 'Private folder ready.' : null);
                    }}
                  />
                  <Pressable onPress={afterPrivate} hitSlop={8} style={{ alignSelf: 'center', padding: 6 }}>
                    <Text style={styles.link}>Later</Text>
                  </Pressable>
                </>
              )}
            </View>
          )
        ) : step === 'ai' ? (
          <View style={styles.box}>
            <Text style={styles.title}>Read photos and files with AI</Text>
            <Text style={styles.sub}>
              Optional. With your own free Google Gemini key, MemoAirem reads schedules from photos and PDFs. Without it,
              voice and typing work fully — and everything works offline.
            </Text>
            <Text style={styles.small}>
              On Google’s free plan, Google may use what you send to improve its products. Your private folder is never
              sent.
            </Text>
            <Button
              label="Add my Gemini key"
              variant="primary"
              onPress={() => {
                setWantsKey(true);
                setStep('ready');
              }}
            />
            <Button label="Skip for now" onPress={() => setStep('ready')} />
          </View>
        ) : (
          <View style={styles.box}>
            <Text style={styles.title}>You’re set{firstName({ name, email }) ? `, ${firstName({ name, email })}` : ''}!</Text>
            <Text style={styles.sub}>Tap the big mic and try:</Text>
            {['“Set schedule dentist Friday at 3 pm”', '“What’s on this week?”', '“Save my passport”', '“When does my passport expire?”'].map(
              (t) => (
                <Text key={t} style={styles.example}>
                  {t}
                </Text>
              ),
            )}
            <Button label={wantsKey ? 'Start — open Settings for the key' : 'Start'} variant="primary" onPress={() => onFinish(wantsKey)} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // zIndex + elevation: on Android the bottom dock (Saved / Log / Private) drew OVER this screen and hid
  // the Next button once the download card made the page taller than the phone.
  screen: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.canvas, zIndex: 20, elevation: 20 },
  content: { flexGrow: 1, padding: 18, gap: 16, justifyContent: 'center' },
  top: { alignItems: 'center', gap: 12 },
  badge: { width: 56, height: 56, borderRadius: 14 },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.line },
  dotOn: { backgroundColor: colors.primary, width: 22 },
  box: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 16,
    gap: 12,
  },
  title: { fontFamily: fonts.groteskSemi, fontSize: 20, color: colors.ink, textAlign: 'center' },
  sub: { fontFamily: fonts.inter, fontSize: 13.5, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  small: { fontFamily: fonts.inter, fontSize: 11.5, color: colors.muted, lineHeight: 16 },
  center: { textAlign: 'center' },
  label: { fontFamily: fonts.interSemi, fontSize: 12, color: colors.muted, marginBottom: -6 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.inter,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.surface2,
  },
  err: { fontFamily: fonts.interSemi, fontSize: 12.5, color: colors.errInk },
  ok: {
    fontFamily: fonts.interSemi,
    fontSize: 12.5,
    color: colors.primaryInk,
    backgroundColor: colors.deviceBg,
    borderRadius: radius.control,
    padding: 10,
    textAlign: 'center',
  },
  link: { fontFamily: fonts.interSemi, fontSize: 13.5, color: colors.muted },
  example: { fontFamily: fonts.inter, fontSize: 14, color: colors.ink, textAlign: 'center' },
});
