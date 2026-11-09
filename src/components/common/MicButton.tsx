/**
 * MicButton — toggles dictation for a given field via the shared recognizer.
 * Always shown. Voice works with no signal: airplane mode must not remove the mic.
 * A tap uses the listener on the phone. Typing stays under the mic.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../../theme/tokens';
import { Icon } from './Icon';
import { useDictation } from '../../state/Dictation';

export function MicButton({
  id,
  onText,
  onError,
  continuous,
  big,
  onDeviceOnly,
}: {
  id: string;
  onText: (transcript: string, isFinal: boolean) => void;
  onError?: (code: string) => void;
  continuous?: boolean;
  big?: boolean;
  onDeviceOnly?: boolean; // 1.10.2: recognise on the phone only (Private folder) — never the cloud
}) {
  const { activeId, finishingId, start, stop } = useDictation();
  const recording = activeId === id;
  const finishing = finishingId === id; // built-in listener is transcribing — the words are coming
  const toggle = () => {
    if (finishing) return;
    if (recording) stop();
    else start(id, onText, continuous, onError, onDeviceOnly);
  };

  if (big) {
    return (
      <Pressable onPress={toggle} style={[styles.big, recording && styles.bigRec, finishing && styles.finishing]}>
        <Icon name="mic" size={30} color={recording ? '#fff' : colors.primary} />
      </Pressable>
    );
  }
  return (
    <Pressable onPress={toggle} style={[styles.small, recording && styles.smallRec, finishing && styles.finishing]}>
      <Icon name="mic" size={16} color={recording ? '#fff' : colors.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  small: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 9,
    paddingVertical: 9,
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallRec: { backgroundColor: colors.accent, borderColor: colors.accent },
  finishing: { opacity: 0.45 },
  big: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigRec: { backgroundColor: colors.accent, borderColor: colors.accent },
});
