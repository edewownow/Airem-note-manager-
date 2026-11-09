/**
 * AutofillPanel (2.0.0-autofill.6, autofill plan phase 2) — inside the open private folder's
 * "Security & backup": is MemoAirem ready to fill passwords in other apps and browsers, and the one
 * button to choose it as Android's autofill service. Three ticks:
 *   1. the folder is in the Kotlin store (the autofill service can open it)
 *   2. fingerprint or PIN can open it (phase 3, 2.0.0-autofill.8: the PIN works inside autofill too;
 *      older cores report no `pin` → fingerprint only)
 *   3. MemoAirem is chosen in Android's settings
 * Rechecked whenever the person comes back from Android's settings.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { Button } from '../common/Button';
import { autofillOpenSettings, autofillStatus, type AutofillStatus } from '../../lib/vault';

export function AutofillPanel() {
  const [st, setSt] = useState<AutofillStatus | null | undefined>(undefined);
  const load = useCallback(() => {
    void autofillStatus().then(setSt);
  }, []);
  useEffect(() => {
    load();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && load());
    return () => sub.remove();
  }, [load]);

  if (st === undefined || st === null) return null; // a build without the autofill service
  if (!st.supported) {
    return (
      <View style={styles.box}>
        <Text style={styles.head}>Fill passwords in other apps</Text>
        <Text style={styles.hint}>Needs Android 8 or newer.</Text>
      </View>
    );
  }
  const unlock = st.fingerprint || !!st.pin;
  const ready = st.folder && st.index !== false && unlock && st.enabled;
  return (
    <View style={styles.box}>
      <Text style={styles.head}>Fill passwords in other apps</Text>
      <Text style={styles.hint}>
        Tap a login box in a browser or an app → “MemoAirem · Unlock to fill” → fingerprint or PIN. It shows only on sites and
        apps where you have a login saved — and goes away as soon as you start typing. Signing up
        somewhere? Tap the new-password box for a strong password. Chrome, Edge, Samsung Internet, Opera, Firefox, Brave, and other browsers can save it.
      </Text>
      <Tick on={st.folder && st.index !== false} text="Your folder is ready for autofill" fix="Close and reopen MemoAirem, then unlock the folder once." />
      <Tick
        on={unlock}
        text={st.pin === undefined ? 'Fingerprint unlock is on' : st.fingerprint ? 'Fingerprint or PIN opens it' : 'Your PIN opens it'}
        fix={st.pin === undefined ? 'Turn on Fingerprint unlock above — autofill opens with your fingerprint.' : 'Lock and unlock the folder once with your PIN.'}
      />
      <Tick on={st.enabled} text="MemoAirem is Android’s autofill service" fix="Tap the button below and choose MemoAirem." />
      {!st.enabled ? <Button small variant="primary" label="Choose MemoAirem for autofill" onPress={() => void autofillOpenSettings()} /> : null}
      {ready ? (
        <Text style={styles.ok}>Ready. Restart the browser after choosing MemoAirem. In Chrome, also: Settings → Autofill Services → “Autofill using another service”.</Text>
      ) : null}
      <Text style={styles.small}>Tip: add the website (e.g. google.com) to each password, so it’s offered on that site by itself.</Text>
    </View>
  );
}

function Tick({ on, text, fix }: { on: boolean; text: string; fix: string }) {
  return (
    <View style={styles.tick}>
      <Text style={[styles.mark, on ? styles.markOn : styles.markOff]}>{on ? '✓' : '○'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.tickText}>{text}</Text>
        {!on ? <Text style={styles.fix}>{fix}</Text> : null}
      </View>
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
    marginTop: 12,
  },
  head: { fontFamily: fonts.groteskSemi, fontSize: 14, color: colors.ink },
  hint: { fontFamily: fonts.inter, fontSize: 12, color: colors.muted, lineHeight: 17 },
  small: { fontFamily: fonts.inter, fontSize: 11.5, color: colors.muted, lineHeight: 16 },
  ok: {
    fontFamily: fonts.interSemi,
    fontSize: 12,
    color: colors.primaryInk,
    backgroundColor: colors.deviceBg,
    borderRadius: radius.control,
    padding: 10,
    lineHeight: 17,
  },
  tick: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  mark: { fontFamily: fonts.interSemi, fontSize: 15, width: 18, textAlign: 'center' },
  markOn: { color: colors.primary },
  markOff: { color: colors.muted },
  tickText: { fontFamily: fonts.interSemi, fontSize: 13, color: colors.ink },
  fix: { fontFamily: fonts.inter, fontSize: 12, color: colors.muted, lineHeight: 17, marginTop: 2 },
});
