/**
 * VaultSetup (1.13.0) — choose the MemoAirem PIN, see + confirm the recovery key, fingerprint on/off.
 * Used by the first-run setup (Onboarding) and by the Private folder (a new folder, a 1.10–1.12
 * folder moving to v3, or restoring a backup on a new phone).
 *
 * Nothing is written until the last step (lib/vault.ts beginSetup / finishSetup): leaving half-way
 * changes nothing. Screenshots are blocked while it's open — the recovery key is on screen.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import { colors, radius } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { Button } from '../common/Button';
import { PinPad } from './PinPad';
import { isWeakPin } from '../../lib/vaultCrypto';
import {
  beginSetup,
  cancelSetup,
  finishSetup,
  recoveryCheckMatches,
  strongBiometricReady,
  type BackupPayload,
  type UnlockResult,
} from '../../lib/vault';
import { copySecret, CLEAR_MS } from '../../lib/secureClipboard';

type Step = 'pin' | 'confirm' | 'key' | 'check' | 'bio' | 'saving';

export function VaultSetup({
  kind,
  restore,
  onDone,
  onCancel,
  guard,
}: {
  /** the fingerprint prompt at the end can look like "app went to background" — not a reason to lock */
  guard?: { authing: React.MutableRefObject<boolean> };
  kind: 'new' | 'move' | 'restore';
  restore?: { payload: BackupPayload; recoveryKey: string } | null;
  onDone: (r: UnlockResult & { restored?: number; gemini?: boolean; harbor?: boolean }) => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState<Step>('pin');
  const [first, setFirst] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [check, setCheck] = useState('');
  const [copied, setCopied] = useState(false);
  const [bioReady, setBioReady] = useState(false);

  useEffect(() => {
    void ScreenCapture.preventScreenCaptureAsync('memoairem-vault-setup').catch(() => {});
    void strongBiometricReady().then(setBioReady);
    return () => {
      cancelSetup();
      void ScreenCapture.allowScreenCaptureAsync('memoairem-vault-setup').catch(() => {});
    };
  }, []);

  const finish = async (biometric: boolean) => {
    setStep('saving');
    if (guard) guard.authing.current = true;
    const r = await finishSetup({ biometric });
    if (guard) guard.authing.current = false;
    onDone(r);
  };

  const afterKey = () => (bioReady ? setStep('bio') : void finish(false));

  if (step === 'pin' || step === 'confirm') {
    return (
      <View style={styles.box}>
        <PinPad
          resetKey={step}
          title={step === 'pin' ? (kind === 'move' ? 'Choose a PIN for your private folder' : 'Choose a 6-digit PIN') : 'Enter the PIN again'}
          sub={
            step === 'pin'
              ? 'Only for the private folder — not your phone’s PIN. With fingerprint on, you’ll rarely need it.'
              : null
          }
          error={error}
          onComplete={(pin) => {
            if (step === 'pin') {
              if (isWeakPin(pin)) {
                setError('Too easy to guess — choose another.');
                return;
              }
              setError(null);
              setFirst(pin);
              setStep('confirm');
              return;
            }
            if (pin !== first) {
              setError('The PINs didn’t match. Choose it again.');
              setFirst('');
              setStep('pin');
              return;
            }
            setError(null);
            if (kind === 'restore' && restore) {
              beginSetup(pin, { recoveryKey: restore.recoveryKey, restore: restore.payload });
              afterKey(); // they already have the recovery key — it stays the same
              return;
            }
            setCode(beginSetup(pin));
            setStep('key');
          }}
        />
        {onCancel ? <Button label="Not now" onPress={onCancel} small style={{ alignSelf: 'center', marginTop: 8 }} /> : null}
      </View>
    );
  }

  if (step === 'key') {
    return (
      <View style={styles.box}>
        <Text style={styles.title}>Your recovery key</Text>
        <Text style={styles.sub}>
          Write it down on paper and keep it somewhere safe. It opens your private folder if you forget the PIN, and it
          opens your backup file on a new phone. MemoAirem can’t show it again or recover it for you.
        </Text>
        <View style={styles.keyBox}>
          <Text style={styles.keyTxt} selectable={false}>
            {code}
          </Text>
        </View>
        <Button
          small
          label={copied ? `Copied — clears in ${CLEAR_MS / 1000} s` : 'Copy (for a password manager)'}
          onPress={async () => setCopied(await copySecret(code))}
        />
        <Button label="I wrote it down" variant="primary" onPress={() => setStep('check')} />
      </View>
    );
  }

  if (step === 'check') {
    const okNow = recoveryCheckMatches(check);
    return (
      <View style={styles.box}>
        <Text style={styles.title}>Check you have it</Text>
        <Text style={styles.sub}>Type the LAST group of 5 characters of your recovery key.</Text>
        <TextInput
          style={styles.input}
          value={check}
          onChangeText={setCheck}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          importantForAutofill="no"
          spellCheck={false}
          maxLength={6}
          placeholder="e.g. 7KQ2M"
          placeholderTextColor={colors.muted}
        />
        {check.replace(/[\s-]/g, '').length >= 5 && !okNow ? <Text style={styles.err}>That’s not it — look at the last group.</Text> : null}
        <View style={styles.row}>
          <Button label="Show it again" onPress={() => setStep('key')} style={{ flex: 1 }} />
          <Button label="Continue" variant="primary" disabled={!okNow} onPress={afterKey} style={{ flex: 1 }} />
        </View>
      </View>
    );
  }

  if (step === 'bio') {
    return (
      <View style={styles.box}>
        <Text style={styles.title}>Unlock with your fingerprint too?</Text>
        <Text style={styles.sub}>
          Your fingerprint OR your PIN will open the folder. Your phone’s own PIN won’t. If you add a new fingerprint
          later, Android resets this for safety — your PIN still works and it’s set up again.
        </Text>
        <Button label="Yes, use fingerprint" variant="primary" icon="lock" onPress={() => void finish(true)} />
        <Button label="PIN only" onPress={() => void finish(false)} />
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Setting up…</Text>
      <Text style={styles.sub}>Locking your private folder with your PIN and recovery key.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12, alignSelf: 'stretch' },
  title: { fontFamily: fonts.groteskSemi, fontSize: 18, color: colors.ink, textAlign: 'center' },
  sub: { fontFamily: fonts.inter, fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 19 },
  keyBox: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.card,
    backgroundColor: colors.deviceBg,
    paddingVertical: 16,
    paddingHorizontal: 10,
  },
  keyTxt: { fontFamily: fonts.mono, fontSize: 17, letterSpacing: 1, color: colors.ink, textAlign: 'center', lineHeight: 26 },
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
});
