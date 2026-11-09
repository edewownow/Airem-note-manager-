/**
 * VaultSecurity (1.13.0) — the "Security & backup" part of the OPEN private folder:
 * fingerprint on/off · change PIN · new recovery key · make a backup file · add from a backup file.
 * Changing a lock asks for a fresh check first (fingerprint or PIN) — an unlocked phone left on a
 * table isn't enough to take the folder over.
 */
import React, { useState } from 'react';
import { Modal, View, Text, TextInput, StyleSheet, Pressable, Switch } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { Button } from '../common/Button';
import { PinPrompt } from './PinPrompt';
import { AutofillPanel } from './AutofillPanel';
import { readPasswordCsv, type CsvResult } from '../../lib/importCsv';
import { isWeakPin } from '../../lib/vaultCrypto';
import { getProfile } from '../../lib/profile';
import { useApp } from '../../state/AppContext';
import { pickTextFile, shareText } from '../../lib/share';
import { copySecret, CLEAR_MS } from '../../lib/secureClipboard';
import {
  beginNewRecoveryKey,
  biometricOn,
  commitNewRecoveryKey,
  disableBiometric,
  enableBiometric,
  exportBackup,
  importLogins,
  mergeItems,
  applyBackupLinks,
  newRecoveryCheckMatches,
  readBackup,
  removeSecretQuestion,
  secretQuestion,
  secretQuestionProblem,
  setPin,
  setSecretQuestion,
  strongBiometricReady,
} from '../../lib/vault';

export function VaultSecurity({
  guard,
  reauth,
  onMessage,
  onChanged,
  onActivity,
}: {
  /** a touch or a keystroke in these pop-ups counts as use (the folder's 1-minute idle lock) */
  onActivity: () => void;
  guard: { authing: React.MutableRefObject<boolean>; picking: React.MutableRefObject<boolean> };
  reauth: (why: string) => Promise<boolean>;
  onMessage: (m: string) => void;
  onChanged: () => void;
}) {
  const { actions } = useApp();
  const [bio, setBio] = useState(biometricOn());
  const [pinStep, setPinStep] = useState<null | { first: string | null }>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyCheck, setKeyCheck] = useState('');
  const [keyShown, setKeyShown] = useState(true);
  const [importing, setImporting] = useState<{ text: string; name: string } | null>(null);
  const [typed, setTyped] = useState('');
  const [importErr, setImportErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // voice.38: the secret question (forgot PIN, this phone only)
  const [question, setQuestion] = useState(secretQuestion());
  const [qOpen, setQOpen] = useState(false);
  const [qText, setQText] = useState('');
  const [qAns, setQAns] = useState('');
  const [qAns2, setQAns2] = useState('');
  const [qErr, setQErr] = useState<string | null>(null);
  const [qBusy, setQBusy] = useState(false);
  const profile = getProfile();

  const toggleBio = async (on: boolean) => {
    if (on) {
      if (!(await strongBiometricReady())) {
        onMessage('Add a fingerprint in your phone’s settings first.');
        return;
      }
      guard.authing.current = true;
      const done = await enableBiometric();
      guard.authing.current = false;
      setBio(done);
      onMessage(done ? 'Fingerprint unlock is on.' : 'Fingerprint unlock wasn’t turned on.');
    } else {
      if (!(await reauth('Turn off fingerprint unlock'))) return;
      await disableBiometric();
      setBio(false);
      onMessage('Fingerprint unlock is off — the folder opens with your PIN.');
    }
  };

  const startChangePin = async () => {
    if (await reauth('Change PIN')) setPinStep({ first: null });
  };

  const startNewKey = async () => {
    if (!(await reauth('New recovery key'))) return;
    setKeyCheck('');
    setKeyShown(true);
    setNewKey(beginNewRecoveryKey());
  };

  const startQuestion = async () => {
    if (!(await reauth(question ? 'Change secret question' : 'Set a secret question'))) return;
    setQText(question ?? '');
    setQAns('');
    setQAns2('');
    setQErr(null);
    setQOpen(true);
  };

  const saveQuestion = async () => {
    const name = profile?.name ?? '';
    const email = profile?.email ?? '';
    const problem = secretQuestionProblem(qText, qAns, name, email);
    if (problem) return setQErr(problem);
    if (qAns.trim() !== qAns2.trim()) return setQErr('The two answers are different.');
    setQBusy(true);
    try {
      await setSecretQuestion(qText, qAns, name, email);
      setQuestion(secretQuestion());
      setQOpen(false);
      onMessage('Secret question set. If you forget your PIN, your name, e-mail and this answer open the folder on this phone.');
    } catch (e: any) {
      setQErr(String(e?.message ?? e));
    } finally {
      setQBusy(false);
    }
  };

  const dropQuestion = async () => {
    if (!(await reauth('Remove secret question'))) return;
    removeSecretQuestion();
    setQuestion(null);
    onMessage('Secret question removed. Your recovery key still opens the folder.');
  };

  const makeBackup = async () => {
    setBusy(true);
    try {
      const text = exportBackup(getProfile());
      const day = new Date().toISOString().slice(0, 10);
      guard.picking.current = true; // the share sheet is another app
      await shareText(`MemoAirem-private-backup-${day}.json`, text);
      onMessage('Backup file made. It also carries your Gemini key and Harbor link when those are saved in Settings, and it opens only with your recovery key — keep both, but not in the same place.');
    } catch (e: any) {
      onMessage('Couldn’t make the backup: ' + String(e?.message ?? e));
    } finally {
      guard.picking.current = false;
      setBusy(false);
    }
  };

  // 2.0.0-autofill.7: import from Google Password Manager (its CSV export)
  const [gImport, setGImport] = useState<{ name: string; result: CsvResult } | null>(null);
  const startGoogleImport = async () => {
    if (!(await reauth('Import passwords'))) return;
    guard.picking.current = true;
    let f: { name: string; text: string } | null = null;
    try {
      f = await pickTextFile();
    } catch {
      onMessage('That file couldn’t be read.');
    } finally {
      guard.picking.current = false;
    }
    if (!f) return;
    if (f.text.length > 20_000_000) return onMessage('That file is too big to be a password export.');
    const result = readPasswordCsv(f.text);
    if (!result.ok) return onMessage(result.message ?? 'That file couldn’t be read.');
    if (!result.logins.length) return onMessage('No logins with a password were found in that file.');
    setGImport({ name: f.name, result });
  };
  const doGoogleImport = () => {
    if (!gImport) return;
    const rep = importLogins(gImport.result.logins);
    setGImport(null);
    onChanged();
    onMessage(
      `Imported ${rep.added} login${rep.added === 1 ? '' : 's'}` +
        (rep.duplicates ? ` (${rep.duplicates} already in your folder were skipped)` : '') +
        (rep.notesLeftOut ? `. ${rep.notesLeftOut} note${rep.notesLeftOut === 1 ? '' : 's'} couldn’t come along` : '') +
        '. NOW DELETE the exported file from Downloads — it isn’t encrypted, anyone who opens it can read every password.',
    );
  };

  const pickImport = async () => {
    guard.picking.current = true;
    try {
      const f = await pickTextFile();
      if (f) {
        setTyped('');
        setImportErr(null);
        setImporting(f);
      }
    } catch {
      onMessage('That file couldn’t be read.');
    } finally {
      guard.picking.current = false;
    }
  };

  const doImport = () => {
    if (!importing) return;
    const r = readBackup(importing.text, typed);
    if (!r.ok) return setImportErr(r.message);
    const n = mergeItems(r.payload);
    const links = applyBackupLinks(r.payload);
    actions.reloadLink();
    setImporting(null);
    setTyped('');
    onChanged();
    const brought = [links.gemini ? 'Gemini key' : '', links.harbor ? 'Harbor link' : ''].filter(Boolean);
    const extra = brought.length ? ` ${brought.join(' and ')} restored too.` : '';
    onMessage(n ? `Added ${n} item${n === 1 ? '' : 's'} from the backup.${extra}` : `Everything in that backup is already here.${extra}`);
  };

  return (
    <View style={styles.box}>
      <Text style={styles.head}>Security & backup</Text>

      <View style={styles.line}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Fingerprint unlock</Text>
          <Text style={styles.hint}>Fingerprint OR your PIN opens the folder. Your phone’s PIN doesn’t.</Text>
        </View>
        <Switch
          value={bio}
          onValueChange={(v) => void toggleBio(v)}
          trackColor={{ true: colors.primary, false: colors.line }}
          thumbColor={colors.surface}
        />
      </View>

      <View style={styles.line}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Secret question</Text>
          <Text style={styles.hint}>
            {question
              ? `“${question}” — with your name and e-mail, opens the folder on this phone if you forget the PIN.`
              : 'Not set. Lets your name, e-mail and one answer open the folder on this phone if you forget the PIN.'}
          </Text>
        </View>
      </View>
      <View style={styles.btns}>
        <Button small label={question ? 'Change question' : 'Set a question'} onPress={() => void startQuestion()} style={styles.btn} />
        {question ? <Button small label="Remove it" onPress={() => void dropQuestion()} style={styles.btn} /> : null}
      </View>

      <View style={styles.btns}>
        <Button small label="Change PIN" onPress={() => void startChangePin()} style={styles.btn} />
        <Button small label="New recovery key" onPress={() => void startNewKey()} style={styles.btn} />
      </View>
      <View style={styles.btns}>
        <Button small label={busy ? 'Making…' : 'Make a backup file'} icon="download" variant="primary" disabled={busy} onPress={() => void makeBackup()} style={styles.btn} />
        <Button small label="Add from a backup" onPress={() => void pickImport()} style={styles.btn} />
      </View>
      <Button small icon="download" label="Import from Google Password Manager" onPress={() => void startGoogleImport()} />
      <Text style={styles.hint}>
        Export first: Chrome → ⋮ → Settings → Google Password Manager → Settings → Export passwords → Save to Downloads.
        Then pick that file here, and delete it right after.
      </Text>
      <Text style={styles.hint}>
        The backup file is encrypted — only your recovery key opens it. Save it to Google Drive, e-mail or a USB stick;
        on a new phone choose “Restore from a backup file”. MemoAirem never uploads it anywhere itself.
      </Text>

      {/* 2.0.0-autofill.6: fill passwords in other apps and browsers */}
      <AutofillPanel />

      {/* change PIN: new PIN twice */}
      <PinPrompt
        visible={!!pinStep}
        title={pinStep?.first ? 'Enter the new PIN again' : 'Choose a new 6-digit PIN'}
        onClose={() => setPinStep(null)}
        onPin={async (pin) => {
          if (!pinStep) return null;
          if (!pinStep.first) {
            if (isWeakPin(pin)) return 'Too easy to guess — choose another.';
            setPinStep({ first: pin });
            return null;
          }
          if (pin !== pinStep.first) {
            setPinStep({ first: null });
            return 'The PINs didn’t match. Choose it again.';
          }
          await setPin(pin);
          setPinStep(null);
          onMessage('PIN changed.');
          return null;
        }}
      />

      {/* new recovery key: show → type last group → replace */}
      <Modal visible={!!newKey} transparent animationType="fade" onRequestClose={() => setNewKey(null)}>
        <View style={styles.scrim} onTouchStart={onActivity}>
          <View style={styles.card}>
            <Text style={styles.mTitle}>New recovery key</Text>
            {keyShown ? (
              <>
                <Text style={styles.mSub}>
                  Write it down. Once you confirm, the OLD key stops working — and backup files made before open only
                  with the old one, so make a new backup after this.
                </Text>
                <View style={styles.keyBox}>
                  <Text style={styles.keyTxt} selectable={false}>
                    {newKey}
                  </Text>
                </View>
                <Button small label={`Copy (clears in ${CLEAR_MS / 1000} s)`} onPress={() => newKey && void copySecret(newKey)} />
                <Button label="I wrote it down" variant="primary" onPress={() => setKeyShown(false)} />
              </>
            ) : (
              <>
                <Text style={styles.mSub}>Type the LAST group of 5 characters.</Text>
                <TextInput
                  style={styles.input}
                  value={keyCheck}
                  onChangeText={(t) => {
                    onActivity();
                    setKeyCheck(t);
                  }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoComplete="off"
                  importantForAutofill="no"
                  maxLength={6}
                />
                <View style={styles.row}>
                  <Button label="Show again" onPress={() => setKeyShown(true)} style={{ flex: 1 }} />
                  <Button
                    label="Replace key"
                    variant="primary"
                    disabled={!newRecoveryCheckMatches(keyCheck)}
                    onPress={() => {
                      commitNewRecoveryKey();
                      setNewKey(null);
                      onMessage('New recovery key saved. The old one no longer works — make a new backup file now.');
                    }}
                    style={{ flex: 1 }}
                  />
                </View>
              </>
            )}
            <Pressable onPress={() => setNewKey(null)} hitSlop={8} style={{ alignSelf: 'center', padding: 6 }}>
              <Text style={styles.cancel}>Cancel — keep the old key</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* voice.38: set / change the secret question */}
      <Modal visible={qOpen} transparent animationType="fade" onRequestClose={() => setQOpen(false)}>
        <View style={styles.scrim} onTouchStart={onActivity}>
          <View style={styles.card}>
            <Text style={styles.mTitle}>Secret question</Text>
            <Text style={styles.mSub}>
              Write a question only you can answer — not your birthday or a pet’s name others know. One answer is weaker
              than your recovery key, so it works only on this phone and wrong tries pause.
            </Text>
            <Text style={styles.qUses}>
              Opens with: {profile?.name ? profile.name : '(no name — add it in Settings → You)'}
              {profile?.email ? ` · ${profile.email}` : ''} + your answer
            </Text>
            <TextInput
              style={styles.qInput}
              value={qText}
              onChangeText={(t) => { onActivity(); setQText(t); }}
              placeholder="e.g. Name of my first ship?"
              placeholderTextColor={colors.muted}
              autoCapitalize="sentences"
            />
            <TextInput
              style={styles.qInput}
              value={qAns}
              onChangeText={(t) => { onActivity(); setQAns(t); }}
              placeholder="Answer"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              importantForAutofill="no"
              spellCheck={false}
            />
            <TextInput
              style={styles.qInput}
              value={qAns2}
              onChangeText={(t) => { onActivity(); setQAns2(t); }}
              placeholder="Answer again"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              importantForAutofill="no"
              spellCheck={false}
            />
            <Text style={styles.hint}>Capitals, spaces and punctuation don’t matter when you answer.</Text>
            {qErr ? <Text style={styles.err}>{qErr}</Text> : null}
            <View style={styles.row}>
              <Button label="Cancel" onPress={() => setQOpen(false)} style={{ flex: 1 }} />
              <Button label={qBusy ? 'Saving…' : 'Save'} variant="primary" disabled={qBusy} onPress={() => void saveQuestion()} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* 2.0.0-autofill.7: import from Google Password Manager — what was found, then confirm */}
      <Modal visible={!!gImport} transparent animationType="fade" onRequestClose={() => setGImport(null)}>
        <View style={styles.scrim} onTouchStart={onActivity}>
          <View style={styles.card}>
            <Text style={styles.mTitle}>Import passwords</Text>
            <Text style={styles.mSub}>
              Found {gImport?.result.logins.length} login{gImport?.result.logins.length === 1 ? '' : 's'} in “{gImport?.name}”.
              {gImport?.result.skippedNoPassword ? ` ${gImport.result.skippedNoPassword} row${gImport.result.skippedNoPassword === 1 ? '' : 's'} without a password will be skipped.` : ''}
            </Text>
            <Text style={styles.hint}>
              Each becomes a password with its website, so autofill offers it on that site. Logins already in your folder (same
              site and username) are skipped — yours stay as they are.
            </Text>
            <Text style={styles.err}>After importing, delete the exported file — it isn’t encrypted.</Text>
            <View style={styles.row}>
              <Button label="Cancel" onPress={() => setGImport(null)} style={{ flex: 1 }} />
              <Button label={`Import ${gImport?.result.logins.length ?? ''}`} variant="primary" onPress={doGoogleImport} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* add from a backup: the recovery key it was made with */}
      <Modal visible={!!importing} transparent animationType="fade" onRequestClose={() => setImporting(null)}>
        <View style={styles.scrim} onTouchStart={onActivity}>
          <View style={styles.card}>
            <Text style={styles.mTitle}>Open the backup</Text>
            <Text style={styles.mSub}>Type the recovery key for “{importing?.name}”. Items already here are skipped.</Text>
            <TextInput
              style={[styles.input, { fontSize: 15, letterSpacing: 1, minHeight: 60 }]}
              value={typed}
              onChangeText={(t) => {
                onActivity();
                setTyped(t);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              importantForAutofill="no"
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
              placeholderTextColor={colors.muted}
              multiline
            />
            {importErr ? <Text style={styles.err}>{importErr}</Text> : null}
            <View style={styles.row}>
              <Button label="Cancel" onPress={() => setImporting(null)} style={{ flex: 1 }} />
              <Button label="Add" variant="primary" disabled={typed.replace(/[\s-]/g, '').length < 25} onPress={doImport} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 12,
    gap: 10,
    marginTop: 18,
  },
  head: { fontFamily: fonts.groteskSemi, fontSize: 14, color: colors.ink },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { fontFamily: fonts.interSemi, fontSize: 13.5, color: colors.ink },
  hint: { fontFamily: fonts.inter, fontSize: 11.5, color: colors.muted, lineHeight: 16 },
  btns: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, paddingHorizontal: 6 },
  scrim: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 18, gap: 12, width: '100%', maxWidth: 380 },
  mTitle: { fontFamily: fonts.groteskSemi, fontSize: 17, color: colors.ink, textAlign: 'center' },
  mSub: { fontFamily: fonts.inter, fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 19 },
  keyBox: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.card, backgroundColor: colors.deviceBg, padding: 14 },
  keyTxt: { fontFamily: fonts.mono, fontSize: 16, letterSpacing: 1, color: colors.ink, textAlign: 'center', lineHeight: 24 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.mono,
    fontSize: 18,
    letterSpacing: 2,
    textAlign: 'center',
    color: colors.ink,
    backgroundColor: colors.surface2,
  },
  err: { fontFamily: fonts.interSemi, fontSize: 12.5, color: colors.errInk, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 8 },
  cancel: { fontFamily: fonts.interSemi, fontSize: 13, color: colors.muted },
  qUses: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.primaryInk, textAlign: 'center' },
  qInput: {
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
});
