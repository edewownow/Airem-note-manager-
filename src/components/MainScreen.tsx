/**
 * MainScreen — three fixed zones so the query ANSWER has a dedicated home:
 *   ZONE 1 (top, scrolls): header + capture card + ask bar + chips.
 *   ZONE 2 (info window, flex): the answer surface (InfoWindow) — text + image, or
 *           the calm placeholder. Never shows storage chrome.
 *   ZONE 3 (bottom dock, fixed): Saved + Capture-log rows; tap → full-screen folder.
 * Keyboard uses adjustPan (app.config/manifest) so the dock holds to the screen
 * bottom and is covered by the keyboard rather than reflowing upward.
 * Opening a folder is a conditional full-screen render (not navigation, invariant 7).
 */
import type { PrivateListKind } from '../lib/listCommands';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, Pressable, StatusBar as RNStatusBar } from 'react-native';
import { colors, radius, shadow } from '../theme/tokens';
import { fonts } from '../theme/typography';
import { Icon } from './common/Icon';
import { SetupDownloads, setupDownloadsVisible } from './common/SetupDownloads';
import { GemmaLoading } from './common/GemmaLoading';
import { Capture } from './capture/Capture';
import { Assistant, BigMic, CHIPS, type MicHandlers } from './assistant/Assistant';
import { Chip } from './common/Chip';
import { InfoWindow } from './assistant/InfoWindow';
import { BottomDock, type FolderKind } from './BottomDock';
import { FolderScreen } from './FolderScreen';
import { PrivateScreen, type VoiceDraft } from './PrivateScreen';
import { AboutScreen } from './AboutScreen';
import { Onboarding } from './Onboarding';
import { firstName, getProfile, isOnboarded, setOnboarded } from '../lib/profile';
import {
  retrySetupDownloads,
  setupDownloadKind,
  setupDownloadNote,
  resumeSetupDownloads,
  subscribeSetupDownloads,
} from '../lib/setupDownloads';
import { SettingsModal } from './modals/SettingsModal';
import { Lightbox } from './modals/Lightbox';
import { NearMatchModal } from './modals/NearMatchModal';
import { useApp } from '../state/AppContext';
import type { Rec } from '../types';
import type { QueryResult } from '../lib/query';

export function MainScreen() {
  const { state, actions } = useApp();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  // voice.20: the big mic sits in the answer area while the voice card is idle (user: "the mic
  // position replace places with the M logo")
  const micRef = useRef<MicHandlers | null>(null);
  const zone1Ref = useRef<ScrollView | null>(null); // voice.22: scroll the Ask / Save pills into view
  // stable, so the Assistant's effect fires once per appearance of the pills, not on every render
  const showPills = useCallback(() => {
    setTimeout(() => zone1Ref.current?.scrollToEnd({ animated: true }), 80);
  }, []);
  const noop = useCallback(() => {}, []);
  // Categories (variant experiment): "categorize this as X" applies to the
  // record on screen. Returns what actually ended up on screen, so the
  // spoken line (Assistant) always matches it — with nothing on screen the
  // answer says so instead of "Added to X" for something never added. The
  // confirmation names the record, so a list on screen never tags its first
  // item silently.
  const handleResult = useCallback(
    (r: QueryResult): QueryResult => {
      if (!r.categoryAction) {
        setResult(r);
        return r;
      }
      const name = r.categoryAction.name;
      const target = result?.best ?? result?.results[0];
      if (!target) {
        const miss: QueryResult = { ...r, answer: `Nothing on screen to put in ${name} — ask about it first.` };
        setResult(miss);
        return miss;
      }
      const { rec: updated, status } = actions.setRecordCategory(target, name);
      if (status === 'added' && updated) {
        const base = result ?? r;
        const done: QueryResult = {
          ...r,
          results: base.results.map((x) => (x.id === updated.id ? updated : x)),
          best: base.best?.id === updated.id ? updated : base.best,
          answer: `Added ${target.title || 'that record'} to ${name}.`,
        };
        setResult(done);
        return done;
      }
      const kept: QueryResult = {
        ...r,
        answer:
          status === 'already'
            ? `${target.title || 'That record'} is already in ${name}.`
            : `Nothing on screen to put in ${name} — ask about it first.`,
      };
      setResult(kept);
      return kept;
    },
    [result, actions],
  );
  const [openFolder, setOpenFolder] = useState<FolderKind | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [privateQuery, setPrivateQuery] = useState<string | null>(null); // a "password search …" to run
  const [privateExpiry, setPrivateExpiry] = useState<{ all: boolean } | null>(null); // voice.29: an expiry question
  const [privateList, setPrivateList] = useState<PrivateListKind | null>(null); // 2.0.0: "list all passwords …"
  const [privateDraft, setPrivateDraft] = useState<VoiceDraft | null>(null); // a password said on Voice

  // 1.13.0: first run → Onboarding (name, e-mail, private folder PIN + recovery key, optional AI
  // key). It replaces "open Settings when there's no key" — the AI key is optional (offline-first).
  const [onboarding, setOnboarding] = useState(() => !isOnboarded());
  const [greetName, setGreetName] = useState(() => firstName(getProfile()));
  const [downloadNote, setDownloadNote] = useState('');
  const [downloadKind, setDownloadKind] = useState(() => setupDownloadKind());
  useEffect(() => {
    return subscribeSetupDownloads(() => {
      setDownloadNote(setupDownloadNote());
      setDownloadKind(setupDownloadKind());
    });
  }, []);
  useEffect(() => {
    if (state.booted) resumeSetupDownloads();
  }, [state.booted]);
  useEffect(() => {
    if (!settingsOpen) setGreetName(firstName(getProfile())); // after editing the name in Settings
  }, [settingsOpen]);

  // The answer stays on screen while it is spoken. Harbor refreshes the saved list on a
  // timer and that used to clear the answer and bring the mic back mid-sentence. Clear
  // it only when a record it is showing was actually removed.
  useEffect(() => {
    setResult((prev) => {
      if (!prev?.results.length) return prev;
      const live = new Set(state.saved.map((r) => r.id));
      return prev.results.some((r) => !live.has(r.id)) ? null : prev;
    });
  }, [state.saved]);

  const openPhoto = (rec: Rec) => {
    const uri = actions.getImage(rec.imageId) ?? rec.thumb;
    if (uri) setLightbox(uri);
  };

  const online = state.online;

  return (
    <View style={[styles.safe, { paddingTop: RNStatusBar.currentHeight ?? 0 }]}>
      {openFolder || aboutOpen ? null : (
        <View style={styles.zones}>
          {/* ZONE 1 — scrollable top */}
          <ScrollView
            ref={zone1Ref}
            style={[styles.zone1, captureOpen ? styles.zone1Open : null]}
            contentContainerStyle={styles.zone1c}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <View style={styles.brand}>
                <Pressable
                  onPress={() => setAboutOpen(true)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="About MemoAirem"
                >
                  <Image source={require('../../assets/memoairem-app-icon.png')} style={styles.badge} resizeMode="contain" />
                </Pressable>
                <Image
                  source={require('../../assets/memoairem-wordmark.png')}
                  style={styles.wordmark}
                  resizeMode="contain"
                  accessibilityLabel="MemoAirem"
                />
              </View>
              <View style={styles.legend}>
                <View style={[styles.tag, online ? styles.tagCloud : styles.tagOff]}>
                  <View style={[styles.dot, { backgroundColor: online ? colors.cloud : colors.muted }]} />
                  <Text style={[styles.tagText, { color: online ? colors.cloudInk : colors.muted }]}>
                    {online ? 'online' : 'offline'}
                  </Text>
                </View>
                <Pressable style={styles.gear} onPress={() => setSettingsOpen(true)} hitSlop={6}>
                  <Icon name="gear" size={16} color={colors.muted} />
                </Pressable>
              </View>
            </View>

            {!onboarding && setupDownloadsVisible(downloadKind) ? <SetupDownloads /> : null}
            {!onboarding ? <GemmaLoading /> : null}

            {/* voice.15: ONE card — Photo / File / Text across the top, the big mic under them */}
            <View style={styles.oneCard}>
            <Capture
              flat
              open={captureOpen}
              setOpen={setCaptureOpen}
              onPhoto={openPhoto}
              onPrivateSave={(d) => {
                setPrivateDraft({ kind: d.kind, title: d.title, username: d.username, password: d.password, content: d.content });
                setOpenFolder('private');
              }}
            />
            {/* The Assistant stays mounted while Photo, File, or Text is open so a spoken
                question still has somewhere to land. The big mic itself is hidden then. */}
              <Assistant
                panelOpen={captureOpen}
                cardMic={!!result}
                micRef={micRef}
                onIdleChange={noop}
                onReset={() => setResult(null)}
                onPillsShown={showPills}
                onFocusAsk={() => setCaptureOpen(false)}
                onResult={handleResult}
                onPrivateSave={(d) => {
                  setPrivateDraft({ kind: d.kind, title: d.title, username: d.username, password: d.password, content: d.content });
                  setOpenFolder('private');
                }}
                onPrivateSearch={(pq, expiry) => {
                  setPrivateQuery(pq);
                  setPrivateExpiry(expiry ?? null);
                  setPrivateList(null);
                  setOpenFolder('private');
                }}
                onPrivateList={(kind) => {
                  setPrivateQuery(null);
                  setPrivateExpiry(null);
                  setPrivateList(kind);
                  setOpenFolder('private');
                }}
              />
            </View>
          </ScrollView>

          {/* ZONE 2 — the big mic, or an answer. Hidden while Photo, File, or Text is open:
              Back to voice brings it back, and that space belongs to the capture. */}
          {captureOpen ? null : (
            <View style={[styles.info, result ? styles.infoOpen : null]}>
              {!result ? (
                <BigMic micRef={micRef} greeting={greetName} />
              ) : (
                <InfoWindow
                  result={result}
                  onPhoto={openPhoto}
                  onTaught={(question) => micRef.current?.askChip(question)}
                />
              )}
            </View>
          )}

          {/* voice.20 (user: "today, this week, this weekend just above the folders, but separately") */}
          {openFolder || captureOpen ? null : (
            <View style={styles.chipRow}>
              {CHIPS.map((c) => (
                <Chip key={c} label={c} onPress={() => micRef.current?.askChip(c)} />
              ))}
            </View>
          )}

          {/* ZONE 3 — fixed bottom dock */}
          <BottomDock onOpen={setOpenFolder} />
        </View>
      )}

      {openFolder === 'private' ? (
        <PrivateScreen
          initialQuery={privateQuery}
          initialExpiry={privateExpiry}
          initialList={privateList}
          initialDraft={privateDraft}
          onBack={() => {
            setOpenFolder(null);
            setPrivateQuery(null);
            setPrivateExpiry(null);
            setPrivateList(null);
            setPrivateDraft(null); // a voice draft never outlives the folder screen
          }}
        />
      ) : openFolder ? (
        <FolderScreen kind={openFolder} onBack={() => setOpenFolder(null)} onPhoto={openPhoto} />
      ) : null}

      {aboutOpen ? <AboutScreen onBack={() => setAboutOpen(false)} /> : null}

      {onboarding && state.booted ? (
        <Onboarding
          hasAiKey={!!state.link.apiKey}
          onFinish={(openSettings) => {
            setOnboarded();
            setOnboarding(false);
            setGreetName(firstName(getProfile()));
            if (openSettings) setSettingsOpen(true);
          }}
        />
      ) : null}

      <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Lightbox uri={lightbox} onClose={() => setLightbox(null)} />
      <NearMatchModal />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  zones: { flex: 1 },
  zone1: { flexShrink: 1, flexGrow: 0, minHeight: 0 }, // scrolls; yields remaining height to the mic
  zone1Open: { flexGrow: 1 }, // Photo / File / Text: the mic is gone, so this fills down to the dock
  zone1c: { padding: 14, gap: 14 },
  // The mic lives here. This zone does not shrink, so a taller status bar (airplane mode)
  // cannot push it off the bottom of the screen.
  info: { flexGrow: 1, flexShrink: 0, minHeight: 230, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface2, overflow: 'hidden' },
  infoOpen: { minHeight: 320 },
  chipRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.canvas,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1 },
  badge: { width: 38, height: 38, borderRadius: 10 },
  wordmark: { height: 24, aspectRatio: 939 / 134, flexShrink: 1 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 },
  tagCloud: { backgroundColor: colors.cloudBg },
  tagOff: { backgroundColor: colors.surface2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  tagText: { fontFamily: fonts.mono, fontSize: 10.5 },
  gear: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 8, padding: 6 },
  download: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 12,
    gap: 8,
  },
  downloadText: { fontFamily: fonts.inter, fontSize: 13, color: colors.ink, lineHeight: 18 },
  oneCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 8,
    gap: 4,
    ...shadow,
  },
});
