/**
 * VaultGate (1.13.0) — the LOCKED private folder. Picks the right way in:
 *   - no folder yet  → set one up (PIN + recovery key), or restore a backup file (a new phone)
 *   - 1.10–1.12 folder → the phone's lock once, then it moves to v3 (PIN + recovery key) — required
 *   - v3 folder      → fingerprint (tried at once when on) or the MemoAirem PIN;
 *                      "Forgot PIN?" → the recovery key, or (voice.38) name + e-mail + the
 *                      secret-question answer → a new PIN
 * Calls onOpened when the folder is open. Every check it runs sets `authing` (a biometric prompt or
 * the file picker isn't a reason for the screen to lock itself).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { Icon } from '../common/Icon';
import { Button } from '../common/Button';
import { PinPad } from './PinPad';
import { VaultSetup } from './VaultSetup';
import { isWeakPin } from '../../lib/vaultCrypto';
import { pickTextFile } from '../../lib/share';
import { useApp } from '../../state/AppContext';
import {
  biometricOn,
  enableBiometric,
  pinWaitSeconds,
  readBackup,
  secretQuestion,
  unlockWithQuestion,
  setPin,
  unlockVault,
  unlockWithBiometric,
  unlockWithPin,
  unlockWithRecovery,
  vaultMode,
  type BackupPayload,
  type UnlockResult,
} from '../../lib/vault';

type View_ =
  | { at: 'start' } // the mode's first screen
  | { at: 'setup'; kind: 'new' | 'move' }
  | { at: 'restore-key'; text: string; name: string } // a backup file picked — type its recovery key
  | { at: 'restore-setup'; payload: BackupPayload; recoveryKey: string }
  | { at: 'recovery' } // forgot PIN — recovery key
  | { at: 'forgot' } // forgot PIN — pick: secret question or recovery key
  | { at: 'question' } // forgot PIN — name + e-mail + answer
  | { at: 'new-pin'; first: string | null; bioAfter: boolean };

export function VaultGate({
  onOpened,
  onKeyLost,
  guard,
  autoStart = true,
}: {
  onOpened: (r: UnlockResult & { restored?: number; gemini?: boolean; harbor?: boolean }, note?: string | null) => void;
  /** the folder can't be read at all — offer "Delete and start a new one" */
  onKeyLost: () => void;
  guard: { authing: React.MutableRefObject<boolean>; picking: React.MutableRefObject<boolean> };
  autoStart?: boolean;
}) {
  const [mode, setMode] = useState(vaultMode());
  const [view, setView] = useState<View_>({ at: 'start' });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [typedKey, setTypedKey] = useState('');
  const [qName, setQName] = useState('');
  const [qEmail, setQEmail] = useState('');
  const [qAnswer, setQAnswer] = useState('');
  const [wait, setWait] = useState(pinWaitSeconds());
  const bioReset = useRef(false); // Android destroyed the fingerprint copy — remake it after the PIN
  const tried = useRef(false);
  const { actions } = useApp();

  // count down a wrong-PIN pause
  useEffect(() => {
    if (wait <= 0) return;
    const t = setInterval(() => setWait(pinWaitSeconds()), 1000);
    return () => clearInterval(t);
  }, [wait]);

  const check = async <T,>(fn: () => Promise<T>): Promise<T> => {
    guard.authing.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      guard.authing.current = false;
      setBusy(false);
    }
  };

  const fingerprint = useCallback(async () => {
    setMsg(null);
    const r = await check(unlockWithBiometric);
    if (r.ok) return onOpened(r);
    if (r.reason === 'bio-changed') bioReset.current = true;
    setMsg(r.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onOpened]);

  const legacyUnlock = useCallback(async () => {
    setMsg(null);
    const r = await check(unlockVault);
    if (r.ok) {
      setView({ at: 'setup', kind: 'move' });
      return;
    }
    setMsg(r.message);
    if (r.reason === 'key-lost') onKeyLost();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onKeyLost]);

  // Ask at once, like before: fingerprint (v3 with it on) or the phone lock (old folder).
  useEffect(() => {
    if (!autoStart || tried.current) return;
    tried.current = true;
    if (mode === 'v3' && biometricOn() && pinWaitSeconds() === 0) void fingerprint();
    else if (mode === 'legacy') void legacyUnlock();
  }, [autoStart, mode, fingerprint, legacyUnlock]);

  const pinEntered = async (pin: string) => {
    setMsg(null);
    const r = await check(() => unlockWithPin(pin));
    if (r.ok) {
      if (bioReset.current) {
        bioReset.current = false;
        await check(enableBiometric);
      }
      return onOpened(r);
    }
    setWait(pinWaitSeconds());
    setMsg(r.message);
    if (r.reason === 'key-lost') setView({ at: 'recovery' });
  };

  const recoveryEntered = async () => {
    setMsg(null);
    const r = await check(() => unlockWithRecovery(typedKey));
    if (!r.ok) return setMsg(r.message);
    setTypedKey('');
    setView({ at: 'new-pin', first: null, bioAfter: biometricOn() });
  };

  const questionEntered = async () => {
    setMsg(null);
    const r = await check(() => unlockWithQuestion(qName, qEmail, qAnswer));
    if (!r.ok) {
      setWait(pinWaitSeconds());
      setMsg(r.message);
      if (r.reason === 'key-lost') setView({ at: 'recovery' });
      return;
    }
    setQAnswer('');
    setView({ at: 'new-pin', first: null, bioAfter: biometricOn() });
  };

  const pickBackup = async () => {
    setMsg(null);
    guard.picking.current = true;
    try {
      const f = await pickTextFile();
      if (f) setView({ at: 'restore-key', text: f.text, name: f.name });
    } catch {
      setMsg('That file couldn’t be read.');
    } finally {
      guard.picking.current = false;
    }
  };

  const restoreKeyEntered = (text: string) => {
    const r = readBackup(text, typedKey);
    if (!r.ok) return setMsg(r.message);
    setMsg(null);
    setView({ at: 'restore-setup', payload: r.payload, recoveryKey: typedKey });
    setTypedKey('');
  };

  const setupDone = (r: UnlockResult & { restored?: number; gemini?: boolean; harbor?: boolean }) => {
    if (!r.ok) {
      setMsg(r.message);
      setMode(vaultMode());
      setView({ at: 'start' });
      return;
    }
    setMode('v3');
    actions.reloadLink();
    const brought = [r.gemini ? 'Gemini key' : '', r.harbor ? 'Harbor link' : ''].filter(Boolean);
    const extra = brought.length ? ` ${brought.join(' and ')} restored too.` : '';
    onOpened(
      r,
      r.restored !== undefined
        ? `Restored ${r.restored} item${r.restored === 1 ? '' : 's'} from your backup.${extra}`
        : 'Your private folder is locked with your PIN. Keep your recovery key safe.',
    );
  };

  /* ---------- screens ---------- */

  if (view.at === 'setup') {
    return (
      <Wrap>
        <VaultSetup
          guard={guard}
          kind={view.kind}
          onDone={setupDone}
          onCancel={view.kind === 'new' ? () => setView({ at: 'start' }) : undefined}
        />
      </Wrap>
    );
  }
  if (view.at === 'restore-setup') {
    return (
      <Wrap>
        <VaultSetup
          guard={guard}
          kind="restore"
          restore={{ payload: view.payload, recoveryKey: view.recoveryKey }}
          onDone={setupDone}
          onCancel={() => setView({ at: 'start' })}
        />
      </Wrap>
    );
  }
  if (view.at === 'restore-key' || view.at === 'recovery') {
    const restoring = view.at === 'restore-key';
    return (
      <Wrap>
        <Text style={styles.title}>{restoring ? 'Open your backup' : 'Use your recovery key'}</Text>
        <Text style={styles.sub}>
          {restoring
            ? `Type the recovery key for “${view.name}” — the 25 characters you wrote down.`
            : 'Type the 25-character key you wrote down when you set up the folder. Then choose a new PIN.'}
        </Text>
        <TextInput
          style={styles.keyInput}
          value={typedKey}
          onChangeText={setTypedKey}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          importantForAutofill="no"
          spellCheck={false}
          placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
          placeholderTextColor={colors.muted}
          multiline
        />
        {msg ? <Text style={styles.err}>{msg}</Text> : null}
        <View style={styles.row}>
          <Button label="Back" onPress={() => { setMsg(null); setTypedKey(''); setView({ at: 'start' }); }} style={{ flex: 1 }} />
          <Button
            label={busy ? 'Checking…' : 'Open'}
            variant="primary"
            disabled={busy || typedKey.replace(/[\s-]/g, '').length < 25}
            onPress={() => (restoring ? restoreKeyEntered(view.text) : void recoveryEntered())}
            style={{ flex: 1 }}
          />
        </View>
      </Wrap>
    );
  }
  if (view.at === 'forgot') {
    return (
      <Wrap>
        <Text style={styles.title}>Forgot your PIN?</Text>
        <Text style={styles.sub}>Open the folder another way, then choose a new PIN.</Text>
        <Button label="Answer my secret question" variant="primary" onPress={() => { setMsg(null); setView({ at: 'question' }); }} />
        <Button label="Use my recovery key" onPress={() => { setMsg(null); setView({ at: 'recovery' }); }} />
        <Pressable onPress={() => setView({ at: 'start' })} hitSlop={8} style={{ alignSelf: 'center', padding: 6 }}>
          <Text style={styles.link}>Back</Text>
        </Pressable>
      </Wrap>
    );
  }
  if (view.at === 'question') {
    const q = secretQuestion();
    return (
      <Wrap>
        <Text style={styles.title}>Your secret question</Text>
        <Text style={styles.sub}>Type your name and e-mail as you had them when you set the question, then the answer.</Text>
        <TextInput style={styles.field} value={qName} onChangeText={setQName} placeholder="Your name" placeholderTextColor={colors.muted} autoCapitalize="words" autoCorrect={false} autoComplete="off" importantForAutofill="no" />
        <TextInput style={styles.field} value={qEmail} onChangeText={setQEmail} placeholder="E-mail (empty if you had none)" placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} autoComplete="off" importantForAutofill="no" />
        <Text style={styles.question}>{q}</Text>
        <TextInput style={styles.field} value={qAnswer} onChangeText={setQAnswer} placeholder="Your answer" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} autoComplete="off" importantForAutofill="no" spellCheck={false} />
        {wait > 0 ? (
          <Text style={styles.err}>Too many wrong tries. Try again in {wait < 60 ? `${wait} s` : `${Math.ceil(wait / 60)} min`}.</Text>
        ) : msg ? (
          <Text style={styles.err}>{msg}</Text>
        ) : null}
        <View style={styles.row}>
          <Button label="Back" onPress={() => { setMsg(null); setQAnswer(''); setView({ at: 'forgot' }); }} style={{ flex: 1 }} />
          <Button
            label={busy ? 'Checking…' : 'Open'}
            variant="primary"
            disabled={busy || wait > 0 || !qName.trim() || !qAnswer.trim()}
            onPress={() => void questionEntered()}
            style={{ flex: 1 }}
          />
        </View>
      </Wrap>
    );
  }
  if (view.at === 'new-pin') {
    return (
      <Wrap>
        <PinPad
          resetKey={view.first ?? 'first'}
          title={view.first ? 'Enter the new PIN again' : 'Choose a new 6-digit PIN'}
          sub={view.first ? null : 'Your folder is open. Set a new PIN to finish.'}
          error={msg}
          busy={busy}
          onComplete={async (pin) => {
            if (!view.first) {
              if (isWeakPin(pin)) return setMsg('Too easy to guess — choose another.');
              setMsg(null);
              return setView({ ...view, first: pin });
            }
            if (pin !== view.first) {
              setMsg('The PINs didn’t match. Choose it again.');
              return setView({ ...view, first: null });
            }
            await check(() => setPin(pin));
            if (view.bioAfter) await check(enableBiometric);
            onOpened({ ok: true, created: false }, 'New PIN set. Your recovery key is unchanged — keep it safe.');
          }}
        />
      </Wrap>
    );
  }

  // view.at === 'start'
  if (mode === 'none') {
    return (
      <Wrap icon>
        <Text style={styles.title}>Set up your private folder</Text>
        <Text style={styles.sub}>
          Passwords, notes and documents, encrypted on this phone only. You’ll choose a 6-digit PIN and get a recovery
          key to write down — so you can’t be locked out.
        </Text>
        {msg ? <Text style={styles.msg}>{msg}</Text> : null}
        <Button label="Set up" variant="primary" icon="lock" onPress={() => setView({ at: 'setup', kind: 'new' })} />
        <Button label="Restore from a backup file" icon="download" onPress={() => void pickBackup()} />
      </Wrap>
    );
  }
  if (mode === 'legacy') {
    return (
      <Wrap icon>
        <Text style={styles.title}>Private folder is locked</Text>
        <Text style={styles.sub}>
          New in this version: your own PIN and a recovery key, so you can’t be locked out. Unlock once with your
          phone’s lock to set them up.
        </Text>
        {msg ? <Text style={styles.msg}>{msg}</Text> : null}
        <Button label={busy ? 'Unlocking…' : 'Unlock'} variant="primary" icon="lock" onPress={() => void legacyUnlock()} disabled={busy} />
      </Wrap>
    );
  }
  return (
    <Wrap>
      <PinPad
        title="Private folder is locked"
        sub={wait > 0 ? null : biometricOn() ? 'Fingerprint, or your MemoAirem PIN' : 'Enter your MemoAirem PIN'}
        error={wait > 0 ? `Too many wrong PINs. Try again in ${wait < 60 ? `${wait} s` : `${Math.ceil(wait / 60)} min`}.` : msg}
        busy={busy}
        onComplete={(pin) => void pinEntered(pin)}
        leftKey={biometricOn() ? { label: 'Finger-\nprint', onPress: () => void fingerprint() } : null}
      />
      <Pressable onPress={() => { setMsg(null); setView(secretQuestion() ? { at: 'forgot' } : { at: 'recovery' }); }} hitSlop={8} style={{ marginTop: 6 }}>
        <Text style={styles.link}>{secretQuestion() ? 'Forgot PIN?' : 'Forgot PIN? Use your recovery key'}</Text>
      </Pressable>
    </Wrap>
  );
}

function Wrap({ children, icon }: { children: React.ReactNode; icon?: boolean }) {
  return (
    <View style={styles.wrap}>
      {icon ? (
        <View style={styles.lockIc}>
          <Icon name="lock" size={30} color={colors.primary} />
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, alignItems: 'stretch', justifyContent: 'center', padding: 24, gap: 12 },
  lockIc: { alignSelf: 'center', backgroundColor: colors.deviceBg, borderRadius: 999, padding: 18, marginBottom: 4 },
  title: { fontFamily: fonts.groteskSemi, fontSize: 18, color: colors.ink, textAlign: 'center' },
  sub: { fontFamily: fonts.inter, fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 19 },
  msg: {
    fontFamily: fonts.inter,
    fontSize: 12.5,
    color: colors.warnInk,
    backgroundColor: colors.warnBg,
    borderRadius: radius.control,
    padding: 10,
    textAlign: 'center',
  },
  err: { fontFamily: fonts.interSemi, fontSize: 12.5, color: colors.errInk, textAlign: 'center' },
  link: { fontFamily: fonts.interSemi, fontSize: 13, color: colors.primary, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 8 },
  field: {
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
  question: { fontFamily: fonts.interSemi, fontSize: 15, color: colors.ink, textAlign: 'center', marginTop: 4 },
  keyInput: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontFamily: fonts.mono,
    fontSize: 16,
    letterSpacing: 1,
    textAlign: 'center',
    color: colors.ink,
    backgroundColor: colors.surface2,
    minHeight: 64,
  },
});
