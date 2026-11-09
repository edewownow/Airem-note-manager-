/**
 * SettingsModal — the AI link (provider/key/model), the spoken-answer Voice
 * picker, and a testing-only "Load sample data" action. The API key is the ONLY
 * place the key lives. Present → online features light up; absent → pure-offline.
 *
 * Reset (1.7.0) is the last section, COLLAPSED and re-collapsed every time Settings
 * closes, so start-fresh is never one tap away. Deleting takes a red warning plus two
 * native confirms, and writes an Undo backup first (lib/backup.ts) — no backup, no delete.
 * Undo last reset / Delete backup appear in the same section while a backup exists.
 */
import { VoiceLearning } from './VoiceLearning';
import { GemmaTrial } from './GemmaTrial';
import { llm } from '../../lib/llmNative';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TextInput, StyleSheet, Pressable, ScrollView, AppState, Alert, Switch } from 'react-native';
import { colors, radius, shadow } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { Button } from '../common/Button';
import { Chip } from '../common/Chip';
import { Icon } from '../common/Icon';
import { useApp } from '../../state/AppContext';
import { HarborSync } from '../HarborSync';
import { loadSyncConfig } from '../../lib/sync';
import { DEFAULT_MODEL, loadCategoriesOn, saveCategoriesOn } from '../../lib/settings';
import { clearActiveCategory } from '../../lib/categories';
import { choiceId, groupVoices, listVoices, speak, ttsEngine, voiceKey, type VoiceChoice } from '../../lib/speech';
import { BuiltInVoice } from './BuiltInVoice';
import { BuiltInListening } from './BuiltInListening';
import { emailLooksRight, getProfile, saveProfile } from '../../lib/profile';
import { secretQuestion } from '../../lib/vault';
import { listMicWords } from '../../lib/learning';

const SAMPLE_LINE = 'You have two things tomorrow. Standup at 9 AM, and dentist at 2:30 PM.';

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** A tap-to-expand section (no UI kit) — a header row with a chevron + a body. */
function Collapsible({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Pressable style={styles.secHead} onPress={onToggle} hitSlop={4}>
        <Text style={styles.secTitle}>{title}</Text>
        <View style={[styles.chev, { transform: [{ rotate: open ? '180deg' : '0deg' }] }]}>
          <Icon name="chevron" size={16} color={colors.muted} />
        </View>
      </Pressable>
      {open ? <View style={styles.secBody}>{children}</View> : null}
    </View>
  );
}

export function SettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { state, actions } = useApp();
  const [key, setKey] = useState('');
  // 1.13.0: the profile (name + e-mail, on this phone only)
  const [pName, setPName] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [voices, setVoices] = useState<VoiceChoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [listenOpen, setListenOpen] = useState(false);
  const [engine, setEngine] = useState(ttsEngine()); // feat/built-in-voice: which engine speaks
  const [learnOpen, setLearnOpen] = useState(false);
  const [gemmaOpen, setGemmaOpen] = useState(false); // feat/gemma TRIAL
  const [resetOpen, setResetOpen] = useState(false);
  // Categories (variant experiment): on/off switch — off means tags are just text.
  const [catOpen, setCatOpen] = useState(false);
  const [catOn, setCatOn] = useState(() => loadCategoriesOn());
  const corrCount = state.corrections.length;

  // Latest voiceId in a ref so loadVoices stays stable and reads it without re-creating.
  const voiceIdRef = useRef(state.voiceId);
  voiceIdRef.current = state.voiceId;

  /**
   * Re-query the system TTS voices. The OS can briefly drop/reload its TTS engine, so
   * getAvailableVoicesAsync() returns [] for a window — that's "not loaded yet", NOT the truth.
   * So: retry a few times on empty, and NEVER overwrite a previously-good list with an empty one
   * (a transient drop must not wipe a working picker). Called whenever the picker can be seen —
   * modal open, Voice section expand, and app foreground (the engine often recovers on resume).
   */
  const loadVoices = useCallback(async () => {
    setVoicesLoading(true);
    let filtered: VoiceChoice[] = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      filtered = groupVoices(await listVoices());
      if (filtered.length) break;
      await new Promise((r) => setTimeout(r, 500)); // engine may be (re)loading — wait & retry
    }
    if (filtered.length) {
      setVoices(filtered);
      // Seed a default selection if none is saved yet.
      if (!voiceIdRef.current) {
        const best = filtered[0]; // grouped list is sorted best-first
        if (best) actions.setVoiceId(choiceId(best));
      }
    }
    // else: keep the last-known-good list (don't cache empty as truth); the empty state below
    // only shows when we've genuinely never gotten any voices.
    setVoicesLoading(false);
  }, [actions]);

  // (Re)load when the modal opens — always reflect the CURRENT system voices, not a startup cache.
  useEffect(() => {
    if (visible) {
      setKey(state.link.apiKey);
      setModel(state.link.model || DEFAULT_MODEL);
      const p = getProfile();
      setPName(p?.name ?? '');
      setPEmail(p?.email ?? '');
      void loadVoices();
    }
  }, [visible, state.link, loadVoices]);

  // Reset stays hidden: collapse it again whenever Settings closes. Re-read the backup
  // each time Settings opens so the Undo row reflects what's actually stored.
  const [backup, setBackup] = useState<{ ts: number; count: number } | null>(null);
  useEffect(() => {
    if (!visible) setResetOpen(false);
    else setBackup(actions.resetBackupInfo());
  }, [visible, actions]);

  const hasData =
    state.saved.length > 0 || state.log.length > 0 || state.queue.length > 0 || corrCount > 0;

  /** Start fresh — red warning box, then two confirms, then backup + wipe. */
  const confirmReset = () => {
    const harbor = loadSyncConfig() != null;
    const what = [
      plural(state.saved.length, 'saved item') + (harbor ? ' (on this phone AND on Harbor)' : ''),
      'the capture log',
      state.queue.length ? plural(state.queue.length, 'queued capture') : null,
      corrCount ? plural(corrCount, 'learned correction') : null,
    ].filter(Boolean);
    const replaces = backup ? '\n\nThis replaces the backup from your previous reset.' : '';
    Alert.alert(
      '⚠ Delete all data?',
      `This deletes ${what.join(', ')}.\n\nYour AI key, Harbor link and voice stay. A backup is kept on this phone so you can Undo from Settings → Reset.${replaces}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Last check',
              `${plural(state.saved.length, 'item')} will disappear from MemoAirem${harbor ? ' and from Muse' : ''}. Only the Undo backup on this phone can bring them back.`,
              [
                { text: 'Keep my data', style: 'cancel' },
                {
                  text: 'Delete everything',
                  style: 'destructive',
                  onPress: () => {
                    if (!actions.clearAllData()) {
                      Alert.alert(
                        'Nothing was deleted',
                        'MemoAirem could not save the Undo backup, so it stopped before deleting anything. Free some phone storage and try again.',
                      );
                      return;
                    }
                    setBackup(actions.resetBackupInfo());
                    setResetOpen(false);
                    onClose();
                    Alert.alert(
                      'All clear',
                      'MemoAirem is empty and ready for new captures. Changed your mind? Settings → Reset → Undo last reset.',
                      [
                        { text: 'Undo now', onPress: () => runUndo() },
                        { text: 'OK', style: 'cancel' },
                      ],
                    );
                  },
                },
              ],
            ),
        },
      ],
    );
  };

  const runUndo = () => {
    const n = actions.undoReset();
    setBackup(null);
    Alert.alert('Restored', `${plural(n, 'item')} brought back${loadSyncConfig() ? ' and sent to Harbor again' : ''}.`);
  };

  const confirmUndo = () => {
    if (!backup) return;
    Alert.alert(
      'Undo last reset?',
      `Brings back ${plural(backup.count, 'item')}, the capture log and corrections from ${new Date(backup.ts).toLocaleString()}. Anything you captured since stays too.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Undo', onPress: runUndo },
      ],
    );
  };

  const confirmDiscard = () => {
    if (!backup) return;
    Alert.alert(
      'Delete the backup?',
      `After this, the reset from ${new Date(backup.ts).toLocaleString()} can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete backup',
          style: 'destructive',
          onPress: () => {
            actions.discardResetBackup();
            setBackup(null);
          },
        },
      ],
    );
  };

  // (Re)load when the Voice picker is expanded — opening the picker re-queries the live list.
  useEffect(() => {
    if (visible && voiceOpen) void loadVoices();
  }, [visible, voiceOpen, loadVoices]);

  // The OS often reloads its TTS engine; when the app returns to foreground with Settings open,
  // re-query so a recovered engine repopulates the picker without a swipe-close relaunch.
  useEffect(() => {
    if (!visible) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void loadVoices();
    });
    return () => sub.remove();
  }, [visible, loadVoices]);

  const pickVoice = (c: VoiceChoice) => {
    const id = choiceId(c);
    actions.setVoiceId(id);
    speak(SAMPLE_LINE, id, state.online); // preview immediately, with the copy that will be used
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        {/* Behind the card, so a drag on the list is a scroll on the first try.
            A Pressable wrapped around the list was claiming that first flick. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close settings" />
        <View style={styles.box}>
          <ScrollView
            style={styles.scroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.h3}>You</Text>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={pName}
              onChangeText={setPName}
              placeholder="your name"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
            />
            <Text style={styles.label}>E-mail (optional)</Text>
            <TextInput
              style={styles.input}
              value={pEmail}
              onChangeText={setPEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Text style={styles.note}>On this phone only — no account. Shown on your private backup file.</Text>
            {secretQuestion() ? (
              <Text style={styles.note}>
                Your private folder’s secret question uses your name and e-mail as they were when you set it. Changed them?
                Set the question again (Private folder → Security & backup).
              </Text>
            ) : null}

            <View style={styles.divider} />
            <Text style={styles.h3}>Gemini API</Text>

            <Text style={styles.label}>API key</Text>
            <TextInput
              style={styles.input}
              value={key}
              onChangeText={setKey}
              placeholder="AIza…"
              placeholderTextColor={colors.muted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Model</Text>
            <TextInput
              style={styles.input}
              value={model}
              onChangeText={setModel}
              placeholder={DEFAULT_MODEL}
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.note}>
              Stored only on this device. Get a free key at aistudio.google.com/apikey. Fine for
              personal use — don’t share it.
            </Text>

            <View style={styles.divider} />
            <HarborSync active={visible} />

            {/* spoken-answer voice (collapsible) */}
            <View style={styles.divider} />
            <Collapsible title="Voice" open={voiceOpen} onToggle={() => setVoiceOpen((o) => !o)}>
              {/* feat/built-in-voice: Phone / Built-in (Kokoro) + download + Kokoro voices */}
              <BuiltInVoice onEngineChange={setEngine} />
              {engine === 'phone' ? (
                <>
                <Pressable
                  onPress={() => speak(SAMPLE_LINE, state.voiceId || undefined, state.online)}
                  hitSlop={6}
                  style={styles.testWrap}
                >
                  <Text style={styles.test}>🔊 test voice</Text>
                </Pressable>
                {voices.length ? (
                  <View style={styles.voiceWrap}>
                    {voices.map((c) => (
                      <Chip
                        key={c.key}
                        label={c.hq ? `★ ${c.label}` : c.label}
                        active={!!state.voiceId && voiceKey(state.voiceId) === c.key}
                        onPress={() => pickVoice(c)}
                      />
                    ))}
                  </View>
                ) : voicesLoading ? (
                  <Text style={styles.note}>Loading voices…</Text>
                ) : (
                  <View style={styles.voiceEmpty}>
                    <Text style={styles.note}>
                      No on-device voices found — the system speech engine may still be loading.
                    </Text>
                    <Pressable onPress={() => void loadVoices()} hitSlop={6} style={styles.testWrap}>
                      <Text style={styles.test}>↻ retry</Text>
                    </Pressable>
                  </View>
                )}
                <Text style={styles.note}>
                  Used to read query answers aloud. Toggle speaking on/off per question with 🔊 on the
                  ask bar. ★ = high-quality voice. With signal the phone uses the voice’s online version
                  (more natural); offline it uses the version stored on the phone.
                </Text>
                <Text style={styles.note}>
                  Robotic or few voices? In Android Settings, search “Text-to-speech output”, set the
                  preferred engine to Speech Services by Google, then open its settings → Install voice
                  data → English and download the voices.
                </Text>
                </>
              ) : null}
            </Collapsible>

            {/* who turns speech into text: Google first / Phone only + built-in Whisper (voice.3) */}
            <View style={styles.divider} />
            <Collapsible title="Listening" open={listenOpen} onToggle={() => setListenOpen((o) => !o)}>
              <BuiltInListening />
            </Collapsible>

            {/* learning / corrections (collapsible) — relocated from the capture screen */}
            <View style={styles.divider} />
            <Collapsible
              title={listMicWords().length ? `Learning · ${listMicWords().length} fixed on the mic` : 'Learning'}
              open={learnOpen}
              onToggle={() => setLearnOpen((o) => !o)}
            >
              <Text style={styles.note}>
                When you edit or delete a parsed record before saving, the change is kept as a
                correction. With Hints on, recent corrections are fed back to the AI on your next
                parse to nudge its field choices.
              </Text>
              <View style={styles.learnRow}>
                <Text style={styles.learnCount}>
                  🎓 {corrCount} correction{corrCount === 1 ? '' : 's'}
                </Text>
                <Button
                  label="Hints"
                  variant="ghost"
                  small
                  onPress={actions.toggleExamples}
                  style={state.useExamples ? styles.hintOn : undefined}
                />
                <Button
                  label="export"
                  variant="ghost"
                  small
                  disabled={!corrCount}
                  onPress={actions.exportCorrections}
                />
              </View>
              {/* 2.0.0 build 97: voice learning — my words, lessons, what MemoAirem missed */}
              <View style={styles.divider} />
              <VoiceLearning />
            </Collapsible>

            {/* Categories (variant experiment): #tags group records; a selected one scopes search. */}
            <View style={styles.divider} />
            <Collapsible title="Categories" open={catOpen} onToggle={() => setCatOpen((o) => !o)}>
              <View style={styles.catRow}>
                <Text style={styles.catLabel}>Group records with #tags</Text>
                <Switch
                  value={catOn}
                  onValueChange={(v) => {
                    setCatOn(v);
                    saveCategoriesOn(v);
                    if (!v) clearActiveCategory();
                  }}
                />
              </View>
              <Text style={styles.note}>
                Add #ship safety to a note to put it in a category. Say “hashtag ship safety” to
                search only that category. A selected category clears itself after a few minutes
                with no questions. Off means tags are just text — no scoping, no select.
              </Text>
            </Collapsible>

            {/* feat/gemma (TRIAL): Gemma on this phone — only in builds that have the module */}
            {llm() ? (
              <>
                <View style={styles.divider} />
                <Collapsible title="Gemma on this phone" open={gemmaOpen} onToggle={() => setGemmaOpen((o) => !o)}>
                  {gemmaOpen ? <GemmaTrial /> : null}
                </Collapsible>
              </>
            ) : null}

            {/* testing helper */}
            <View style={styles.divider} />
            <Button
              label="Load sample data"
              variant="ghost"
              icon="plus"
              onPress={() => {
                actions.loadSample();
                onClose();
              }}
            />

            {/* reset / start fresh — hidden (collapsed) by default, closes again with Settings */}
            <View style={styles.divider} />
            <Collapsible title="Reset" open={resetOpen} onToggle={() => setResetOpen((o) => !o)}>
              <View style={styles.warnBox}>
                <Text style={styles.warnTitle}>⚠ Start fresh</Text>
                <Text style={styles.warnText}>
                  Deletes every saved item (on this phone and on Harbor), the capture log, queued
                  captures and learned corrections. Your AI key, Harbor link and voice are kept. A
                  backup stays on this phone so you can undo.
                </Text>
              </View>
              <Button
                label="Delete all data…"
                variant="danger"
                onPress={confirmReset}
                disabled={!hasData}
                style={styles.resetBtn}
              />
              {!hasData ? <Text style={styles.note}>Nothing to delete — MemoAirem is already empty.</Text> : null}
              {backup ? (
                <View style={styles.undoBox}>
                  <Text style={styles.undoText}>
                    Backup from {new Date(backup.ts).toLocaleString()} · {plural(backup.count, 'item')}
                  </Text>
                  <View style={styles.undoRow}>
                    <Button label="Undo last reset" variant="primary" small onPress={confirmUndo} />
                    <Button label="Delete backup" variant="ghost" small onPress={confirmDiscard} />
                  </View>
                </View>
              ) : null}
            </Collapsible>

            <View style={styles.btns}>
              <Button label="Close" variant="ghost" onPress={onClose} />
              <Button
                label="Save"
                variant="primary"
                onPress={() => {
                  if (!emailLooksRight(pEmail)) {
                    Alert.alert('Check your e-mail', 'That e-mail doesn’t look right — fix it or leave it empty.');
                    return;
                  }
                  if (pName.trim() || pEmail.trim() || getProfile()) saveProfile({ name: pName, email: pEmail });
                  actions.saveLink({ provider: 'gemini', apiKey: key.trim(), model: model.trim() || DEFAULT_MODEL });
                  onClose();
                }}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  box: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '85%',
    flexShrink: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 20,
    ...shadow,
  },
  // Bounded by the card, so the list scrolls instead of growing past the screen.
  scroll: { flexGrow: 0, flexShrink: 1 },
  h3: { fontFamily: fonts.groteskSemi, fontSize: 17, color: colors.ink, marginBottom: 12 },
  label: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, marginTop: 10, marginBottom: 4 },
  input: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.control,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontFamily: fonts.inter,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.surface2,
  },
  note: { fontFamily: fonts.inter, fontSize: 11.5, color: colors.muted, marginTop: 12, lineHeight: 17 },
  catRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 },
  catLabel: { fontFamily: fonts.interSemi, fontSize: 14, color: colors.ink },
  divider: { height: 1, backgroundColor: colors.line, marginTop: 18, marginBottom: 4 },
  // collapsible section header + body
  secHead: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  secTitle: { fontFamily: fonts.groteskSemi, fontSize: 16, color: colors.ink },
  chev: { marginLeft: 'auto' },
  secBody: { paddingTop: 2, paddingBottom: 4 },
  testWrap: { alignSelf: 'flex-start' },
  test: { fontFamily: fonts.mono, fontSize: 12, color: colors.primary, marginBottom: 12 },
  voiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, rowGap: 7 },
  voiceEmpty: { gap: 4 },
  // learning / corrections row
  learnRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  learnCount: { flex: 1, fontFamily: fonts.mono, fontSize: 11, color: colors.muted },
  hintOn: { backgroundColor: colors.deviceBg, borderColor: colors.device },
  // reset warning
  warnBox: {
    borderWidth: 1,
    borderColor: colors.fail,
    borderRadius: radius.control,
    padding: 12,
    marginTop: 4,
  },
  warnTitle: { fontFamily: fonts.interSemi, fontSize: 13, color: colors.fail, marginBottom: 4 },
  warnText: { fontFamily: fonts.inter, fontSize: 12, color: colors.ink, lineHeight: 17 },
  resetBtn: { marginTop: 12, alignSelf: 'flex-start' },
  undoBox: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  undoText: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted },
  undoRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
});
