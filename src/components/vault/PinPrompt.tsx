/**
 * PinPrompt (1.13.0) — the MemoAirem PIN as a pop-up: re-check before showing / copying a password,
 * and the steps of "Change PIN". `onPin` returns null when accepted, or the message to show.
 */
import React, { useEffect, useState } from 'react';
import { Modal, View, Pressable, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { PinPad } from './PinPad';

export function PinPrompt({
  visible,
  title,
  sub,
  onPin,
  onClose,
}: {
  visible: boolean;
  title: string;
  sub?: string | null;
  onPin: (pin: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (visible) setError(null);
  }, [visible, title]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <PinPad
            resetKey={title}
            title={title}
            sub={sub}
            error={error}
            busy={busy}
            onComplete={async (pin) => {
              setBusy(true);
              const e = await onPin(pin);
              setBusy(false);
              setError(e);
            }}
          />
          <Pressable onPress={onClose} hitSlop={8} style={styles.cancel}>
            <Text style={styles.cancelTxt}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, paddingVertical: 20, paddingHorizontal: 12, alignItems: 'center', width: '100%', maxWidth: 360 },
  cancel: { marginTop: 10, padding: 6 },
  cancelTxt: { fontFamily: fonts.interSemi, fontSize: 13.5, color: colors.muted },
});
