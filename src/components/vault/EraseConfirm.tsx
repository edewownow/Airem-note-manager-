/**
 * EraseConfirm (2.0.0-autofill.9, user: "what safeguard do we have for accidentally clicking it") —
 * the ONLY way to delete the private folder.
 *   - folder OPEN: a fresh fingerprint / PIN first (the caller), then type DELETE. Says when a backup
 *     file was last made — or that none was.
 *   - folder LOCKED (lost PIN + recovery key, or keys reset): type DELETE to START a 24-hour wait;
 *     only after it can DELETE erase. Unlocking normally in between cancels it — so whoever picks up
 *     the phone can't wipe the folder in one go, and someone truly locked out can still start over.
 */
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { Button } from '../common/Button';
import { cancelEraseRequest, eraseRequest, lastBackupAt, startEraseRequest } from '../../lib/vault';

const WORD = 'DELETE';

function showLeft(ms: number): string {
  const m = Math.ceil(ms / 60000);
  const h = Math.floor(m / 60);
  return h ? `${h} h ${m % 60} min` : `${m} min`;
}

export function EraseConfirm({
  mode,
  onCancel,
  onErase,
  onActivity,
}: {
  mode: 'open' | 'locked' | null;
  onCancel: () => void;
  onErase: () => Promise<void>;
  onActivity?: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0); // re-read the request after starting / cancelling it
  useEffect(() => {
    if (mode) setTyped('');
  }, [mode]);
  if (!mode) return null;
  const req = mode === 'locked' ? eraseRequest() : null;
  const ready = mode === 'open' || (req !== null && req.readyIn === 0);
  const okWord = typed.trim().toUpperCase() === WORD;
  const backup = lastBackupAt();

  const erase = async () => {
    setBusy(true);
    try {
      await onErase();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <Text style={styles.title}>Delete the private folder?</Text>
          <Text style={styles.body}>
            Every password, note, document and photo in it is erased from this phone, with its keys. It can’t be undone —
            only a backup file plus its recovery key can bring them back.
          </Text>
          {mode === 'open' ? (
            <Text style={[styles.body, !backup && styles.warn]}>
              {backup
                ? `Your last backup file was made ${new Date(backup).toLocaleDateString()}. Anything added since is not in it.`
                : 'You have never made a backup file on this phone. Cancel, then Security & backup → Make a backup file first.'}
            </Text>
          ) : req === null ? (
            <Text style={styles.body}>
              The folder is locked, so this takes a day: type {WORD} to start a 24-hour wait, then come back and type it again.
              If you remember your PIN, just unlock — that cancels it.
            </Text>
          ) : req.readyIn > 0 ? (
            <Text style={[styles.body, styles.warn]}>
              Erase requested. It can be done in {showLeft(req.readyIn)}. Unlocking the folder normally cancels it.
            </Text>
          ) : (
            <Text style={[styles.body, styles.warn]}>The 24-hour wait is over. Type {WORD} to erase the folder now.</Text>
          )}

          {mode === 'open' || req === null || ready ? (
            <TextInput
              style={styles.input}
              value={typed}
              onChangeText={(t) => {
                setTyped(t);
                onActivity?.();
              }}
              placeholder={`Type ${WORD}`}
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              importantForAutofill="no"
            />
          ) : null}

          <View style={styles.row}>
            <Button label="Keep it" onPress={onCancel} style={{ flex: 1 }} disabled={busy} />
            {ready ? (
              <Button label="Erase" variant="danger" onPress={() => void erase()} disabled={!okWord || busy} style={{ flex: 1 }} />
            ) : req === null ? (
              <Button
                label="Start 24 h wait"
                variant="danger"
                disabled={!okWord}
                onPress={() => {
                  startEraseRequest();
                  setTyped('');
                  tick((n) => n + 1);
                }}
                style={{ flex: 1 }}
              />
            ) : (
              <Button
                label="Cancel request"
                onPress={() => {
                  cancelEraseRequest();
                  tick((n) => n + 1);
                }}
                style={{ flex: 1 }}
              />
            )}
          </View>
          {mode === 'locked' && ready ? (
            <Text
              style={styles.link}
              onPress={() => {
                cancelEraseRequest();
                onCancel();
              }}
            >
              Cancel the request instead
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', padding: 20 },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 18, gap: 12 },
  title: { fontFamily: fonts.groteskSemi, fontSize: 17, color: colors.errInk },
  body: { fontFamily: fonts.inter, fontSize: 13, color: colors.ink, lineHeight: 19 },
  warn: { color: colors.errInk, fontFamily: fonts.interSemi },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.interSemi,
    fontSize: 15,
    color: colors.ink,
    letterSpacing: 2,
  },
  row: { flexDirection: 'row', gap: 10 },
  link: { fontFamily: fonts.interSemi, fontSize: 12.5, color: colors.primary, textAlign: 'center' },
});
