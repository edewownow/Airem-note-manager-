/**
 * GemmaTrial (branch feat/gemma — TRIAL, merged only if Ede finds it good) — Settings → Gemma trial.
 *
 *  1. Phone check: Android version, memory, free space, and the model file. If it is missing,
 *     the phone downloads it (about 2.6 GB, once). No computer.
 *  2. Load Gemma (GPU first, then CPU) — shows how long it takes.
 *  3. "Run the 20 test questions" — MADE-UP records (lib/gemma.ts trialRecords), so nothing personal
 *     is ever logged. Each answer must pass the same checks the real feature would use (right
 *     records, no invented numbers). Results + timings on screen and in the log ([gemma] lines).
 *  4. "Try on my records" — a question of yours: today's answer next to Gemma's. On screen ONLY —
 *     your question, records and the answer are never logged. The Private folder is never read.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { Button } from '../common/Button';
import { useApp } from '../../state/AppContext';
import { llm, llmLog, MIN_TOTAL_RAM_MB, type LlmDeviceInfo, type LlmModelFile } from '../../lib/llmNative';
import { ensureGemmaLoaded, gemmaIsLoading, gemmaLoadSeconds } from '../../lib/gemmaLive';
import {
  cancelGemmaInstall,
  gemmaDiskOk,
  GEMMA_BYTES,
  installGemma,
  subscribeGemmaFile,
  type GemmaFileState,
} from '../../lib/gemmaFile';
import {
  checkReply,
  GEMMA_SCHEMA,
  judgeTrial,
  pickRecords,
  shortIds,
  systemPrompt,
  trialRecords,
  TRIAL_CASES,
  userPrompt,
  type TrialOutcome,
} from '../../lib/gemma';
import { localEngine } from '../../lib/query';
import { FINDER_CASES, FINDER_SYSTEM, finderPrompt, finderRecords } from '../../lib/gemmaFinder';
import { spokenReply } from '../../lib/voice';

const MAX_TOKENS = 2048; // the model's window: system + 8 records + question + answer fit easily
const MAX_OUT = 160; // a short spoken answer in JSON

export function GemmaTrial() {
  const { state, actions } = useApp();
  const m = llm();
  const [info, setInfo] = useState<LlmDeviceInfo | null>(null);
  const [models, setModels] = useState<LlmModelFile[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ backend: string; ms: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const [results, setResults] = useState<TrialOutcome[]>([]);
  const [q, setQ] = useState('');
  const [fin, setFin] = useState<{ kind: string; q: string; airem: boolean; gemma: boolean; why: string; ms: number }[]>([]);
  const [mine, setMine] = useState<{ rules: string; gemma: string; ms: number } | null>(null);
  const [file, setFile] = useState<GemmaFileState>({ status: 'unknown', fraction: 0, error: null });
  const stop = useRef(false);

  const refresh = useCallback(() => {
    if (!m) return;
    try {
      setInfo(m.deviceInfo());
      const found = m.findModels();
      setModels(found);
      setPick((p) => p ?? found[0]?.path ?? null);
      const s = m.status();
      if (s.loaded) {
        setLoaded((cur) => (cur && cur.backend === (s.backend || cur.backend) ? cur : { backend: s.backend || 'gpu', ms: 0 }));
      } else {
        setLoaded(null);
      }
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }, [m]);

  useEffect(() => {
    void ensureGemmaLoaded();
    refresh();
    const t = setInterval(refresh, 1000);
    const unsub = subscribeGemmaFile((s) => {
      setFile(s);
      if (s.status === 'ready') {
        refresh();
        void ensureGemmaLoaded();
      }
    });
    return () => {
      clearInterval(t);
      unsub();
      stop.current = true;
    };
  }, [refresh]);

  if (!m) {
    return <Text style={styles.note}>This build has no Gemma module.</Text>;
  }

  const load = async (backend: 'auto' | 'gpu' | 'cpu') => {
    if (!pick) return;
    setErr(null);
    setBusy(
      backend === 'cpu'
        ? 'Preparing Gemma on the CPU… the first time takes a few minutes'
        : 'Preparing Gemma on the GPU… the first time takes several minutes',
    );
    try {
      const r = await m.load(pick, backend, MAX_TOKENS);
      setLoaded(r);
      const i = m.deviceInfo();
      setInfo(i);
      llmLog(`loaded ${pick.split('/').pop()} on ${r.backend} in ${r.ms} ms · free RAM after ${i.availRamMb} MB`);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      llmLog(`load failed: ${String(e?.message ?? e).slice(0, 160)}`);
    }
    setBusy(null);
  };

  const unload = async () => {
    await m.unload().catch(() => false);
    setLoaded(null);
    setResults([]);
    setMine(null);
    refresh();
  };

  const runTrial = async () => {
    setErr(null);
    setResults([]);
    stop.current = false;
    const now = new Date();
    const recs = trialRecords(now);
    const sys = systemPrompt(now);
    const out: TrialOutcome[] = [];
    llmLog(`trial start · ${TRIAL_CASES.length} questions · backend ${loaded?.backend}`);
    for (let i = 0; i < TRIAL_CASES.length; i++) {
      if (stop.current) break;
      const c = TRIAL_CASES[i];
      setBusy(`Question ${i + 1} of ${TRIAL_CASES.length}…`);
      const ids = shortIds(pickRecords(c.q, localEngine.run(recs, c.q).results, recs));
      let o: TrialOutcome;
      try {
        const r = await m.ask(sys, userPrompt(c.q, ids, now), GEMMA_SCHEMA, MAX_OUT);
        o = judgeTrial(c, r.text, ids, r.ms);
        // made-up trial data — safe to log in full, so a failure can be studied
        llmLog(`${o.pass ? 'PASS' : 'FAIL'} ${o.ms} ms · "${c.q}" · ${o.why} · raw ${r.text.replace(/\s+/g, ' ').slice(0, 200)}`);
      } catch (e: any) {
        o = { q: c.q, pass: false, why: 'error: ' + String(e?.message ?? e).slice(0, 80), answer: '', ms: 0 };
        llmLog(`ERROR "${c.q}" · ${o.why}`);
      }
      out.push(o);
      setResults([...out]);
    }
    const pass = out.filter((o) => o.pass).length;
    const times = out.filter((o) => o.ms > 0).map((o) => o.ms).sort((a, b) => a - b);
    const med = times.length ? times[Math.floor(times.length / 2)] : 0;
    llmLog(`trial done · ${pass}/${out.length} right · median ${med} ms · slowest ${times[times.length - 1] ?? 0} ms · ${info?.model ?? ''} RAM ${info?.totalRamMb ?? '?'} MB · ${loaded?.backend}`);
    setBusy(null);
  };

  // feat/gemma-finder: the same made-up records and questions go to Airem's rules and to Gemma (all records shown).
  const runFinder = async () => {
    setErr(null);
    setFin([]);
    stop.current = false;
    const now = new Date();
    const recs = finderRecords(now);
    const out: typeof fin = [];
    llmLog(`finder start · ${FINDER_CASES.length} questions · backend ${loaded?.backend}`);
    for (let i = 0; i < FINDER_CASES.length; i++) {
      if (stop.current) break;
      const c = FINDER_CASES[i];
      setBusy(`Question ${i + 1} of ${FINDER_CASES.length}…`);
      const rr = localEngine.run(recs, c.q).results;
      const titles = rr.slice(0, 3).map((x) => x.title);
      const airem = c.want.length ? c.want.every((t) => titles.includes(t)) : rr.length === 0;
      const { ids, prompt } = finderPrompt(c.q, recs, now);
      let gemma = false, why = '', ms = 0;
      try {
        const r = await m.ask(FINDER_SYSTEM(now), prompt, GEMMA_SCHEMA, MAX_OUT);
        const o = judgeTrial(c, r.text, ids, r.ms);
        gemma = o.pass; why = o.why; ms = r.ms;
        llmLog(`FINDER ${airem ? 'airem✓' : 'airem✗'} ${gemma ? 'gemma✓' : 'gemma✗'} ${ms} ms [${c.kind}] "${c.q}" · ${why} · raw ${r.text.replace(/\s+/g, ' ').slice(0, 160)}`);
      } catch (e: any) {
        why = 'error: ' + String(e?.message ?? e).slice(0, 60);
        llmLog(`FINDER ERROR "${c.q}" · ${why}`);
      }
      out.push({ kind: c.kind, q: c.q, airem, gemma, why, ms });
      setFin([...out]);
    }
    const ts = out.filter((o) => o.ms > 0).map((o) => o.ms).sort((a, b) => a - b);
    const kinds = Array.from(new Set(out.map((o) => o.kind)));
    for (const k of kinds) {
      const g = out.filter((o) => o.kind === k);
      llmLog(`finder [${k}] airem ${g.filter((o) => o.airem).length}/${g.length} · gemma ${g.filter((o) => o.gemma).length}/${g.length}`);
    }
    llmLog(`finder done · airem ${out.filter((o) => o.airem).length}/${out.length} · gemma ${out.filter((o) => o.gemma).length}/${out.length} · median ${ts.length ? ts[Math.floor(ts.length / 2)] : 0} ms · ${info?.model ?? ''} · ${loaded?.backend}`);
    setBusy(null);
  };

  const tryMine = async () => {
    const question = q.trim();
    if (!question) return;
    setErr(null);
    setMine(null);
    setBusy('Asking Gemma…');
    try {
      const now = new Date();
      const rules = actions.runQuery(question);
      const ids = shortIds(pickRecords(question, rules.results, state.saved));
      const r = await m.ask(systemPrompt(now), userPrompt(question, ids, now), GEMMA_SCHEMA, MAX_OUT);
      const res = checkReply(r.text, ids);
      setMine({
        rules: spokenReply(rules),
        gemma: res.ok ? res.answer : `(not used — ${res.why}; the app would give today's answer)`,
        ms: r.ms,
      });
      llmLog(`my-records ask: ${r.ms} ms · ${ids.size} records · ${res.ok ? 'used' : 'rejected ' + res.why}`); // no words logged
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
    setBusy(null);
  };

  const pass = results.filter((r) => r.pass).length;
  const times = results.filter((r) => r.ms > 0).map((r) => r.ms).sort((a, b) => a - b);
  const median = times.length ? times[Math.floor(times.length / 2)] : 0;
  const ramLow = !!info && info.totalRamMb < MIN_TOTAL_RAM_MB;

  return (
    <View style={styles.wrap}>
      <Text style={styles.note}>
        Gemma loads itself on the GPU when you open MemoAirem. The first time after a download takes several minutes, and it stays loaded until you leave the app. If the GPU cannot start, the CPU is used. You still see today’s answer at once. The spoken sentence becomes Gemma’s only when it matches your records. The Private folder is never read.
      </Text>

      {info ? (
        <Text style={styles.small}>
          {info.model} · Android API {info.sdk} · {info.abi}
          {'\n'}Memory {Math.round(info.totalRamMb / 1024)} GB (free {info.availRamMb} MB) · disk free {Math.round(info.freeDiskMb / 1024)} GB
          {!info.supported ? '\n⚠ This phone can’t run Gemma (needs Android 8+, 64-bit).' : ''}
          {ramLow ? `\n⚠ Under ${Math.round(MIN_TOTAL_RAM_MB / 1024)} GB memory — Gemma 4 may not load.` : ''}
        </Text>
      ) : null}

      <Text style={styles.head}>Model file</Text>
      {models.length ? (
        models.map((f) => (
          <Text key={f.path} style={[styles.small, pick === f.path && styles.picked]} onPress={() => setPick(f.path)}>
            {pick === f.path ? '● ' : '○ '}
            {f.name} · {(f.sizeMb / 1024).toFixed(1)} GB
          </Text>
        ))
      ) : file.status === 'downloading' ? (
        <Text style={styles.small}>Downloading Gemma… {Math.round(file.fraction * 100)}%. It stays on this phone.</Text>
      ) : (
        <Text style={styles.small}>
          Gemma is not on this phone yet. Download it once ({(GEMMA_BYTES / 1073741824).toFixed(1)} GB). It stays here and needs no computer.
        </Text>
      )}
      {file.error ? <Text style={styles.err}>{file.error}</Text> : null}
      <View style={styles.row}>
        {models.length || file.status === 'downloading' ? null : (
          <Button
            small
            label="Download Gemma"
            icon="download"
            variant="primary"
            disabled={!!info && !gemmaDiskOk(info.freeDiskMb)}
            onPress={() => void installGemma(info?.freeDiskMb ?? 0)}
          />
        )}
        {file.status === 'downloading' ? (
          <Button small label="Cancel" onPress={cancelGemmaInstall} />
        ) : (
          <Button small label="Look again" icon="search" onPress={refresh} />
        )}
      </View>

      {pick && info?.supported ? (
        loaded ? (
          <View style={styles.row}>
            <Text style={styles.ok}>
              {loaded.ms > 0
                ? `Loaded on ${loaded.backend.toUpperCase()} in ${(loaded.ms / 1000).toFixed(1)} s`
                : `Ready on ${loaded.backend.toUpperCase()}`}
            </Text>
            <Button small label="Unload" onPress={() => void unload()} disabled={!!busy} />
          </View>
        ) : (
          gemmaIsLoading() ? (
            <View style={styles.row}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.small}>
                Preparing Gemma on the GPU… {gemmaLoadSeconds()}s. The first time takes several minutes.
              </Text>
            </View>
          ) : (
            <View style={styles.row}>
              <Button small variant="primary" label="Load Gemma" onPress={() => void load('auto')} disabled={!!busy} />
              <Button small label="CPU only" onPress={() => void load('cpu')} disabled={!!busy} />
            </View>
          )
        )
      ) : null}

      {busy ? (
        <View style={styles.row}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.small}>{busy}</Text>
          {busy.startsWith('Question') ? (
            <Button small label="Stop" onPress={() => (stop.current = true)} />
          ) : null}
        </View>
      ) : null}
      {err ? <Text style={styles.err}>{err}</Text> : null}

      {loaded ? (
        <>
          <View style={styles.divider} />
          <Text style={styles.head} onPress={() => setCheckOpen((o) => !o)}>
            {checkOpen ? '▾' : '▸'} Check (20 questions)
          </Text>
          {checkOpen ? (
            <>
          <Text style={styles.head}>1. Test questions (made-up records)</Text>
          <Button small variant="primary" label={`Run the ${TRIAL_CASES.length} test questions`} onPress={() => void runTrial()} disabled={!!busy} />
          {results.length ? (
            <Text style={styles.score}>
              {pass} of {results.length} right · usually {(median / 1000).toFixed(1)} s per answer
            </Text>
          ) : null}
          {results.map((r) => (
            <Text key={r.q} style={styles.result}>
              <Text style={{ color: r.pass ? colors.good : colors.fail }}>{r.pass ? '✓' : '✗'}</Text> {r.q}
              <Text style={styles.small}>
                {'  '}
                {(r.ms / 1000).toFixed(1)} s{r.answer ? ` — “${r.answer}”` : ''}
                {r.pass ? '' : ` (${r.why})`}
              </Text>
            </Text>
          ))}

          <View style={styles.divider} />
          <Text style={styles.head}>Finder test (Airem vs Gemma)</Text>
          <Text style={styles.small}>{FINDER_CASES.length} questions on made-up records: plain, other words, typos, misheard, not saved. Gemma sees all the records. Nothing live changes.</Text>
          <Button small variant="primary" label="Run the finder test" onPress={() => void runFinder()} disabled={!!busy} />
          {fin.length ? (
            <Text style={styles.score}>
              Airem {fin.filter((f) => f.airem).length} · Gemma {fin.filter((f) => f.gemma).length} of {fin.length}
            </Text>
          ) : null}
          {fin.map((f) => (
            <Text key={f.q} style={styles.result}>
              <Text style={{ color: f.airem ? colors.good : colors.fail }}>{f.airem ? '✓' : '✗'}</Text>
              <Text style={{ color: f.gemma ? colors.good : colors.fail }}>{f.gemma ? '✓' : '✗'}</Text> {f.q}
              <Text style={styles.small}>{'  '}{f.kind} · {(f.ms / 1000).toFixed(1)} s{f.gemma ? '' : ` (${f.why})`}</Text>
            </Text>
          ))}

          <View style={styles.divider} />
          <Text style={styles.head}>2. Try on my records</Text>
          <Text style={styles.small}>Shown here only — never logged. The Private folder is never read.</Text>
          <TextInput
            style={styles.input}
            value={q}
            onChangeText={setQ}
            placeholder="e.g. where is the chicken"
            placeholderTextColor={colors.muted}
            onSubmitEditing={() => void tryMine()}
          />
          <Button small label="Compare" onPress={() => void tryMine()} disabled={!!busy || !q.trim()} />
          {mine ? (
            <View style={styles.compare}>
              <Text style={styles.small}>Today’s answer:</Text>
              <Text style={styles.answer}>{mine.rules}</Text>
              <Text style={styles.small}>Gemma ({(mine.ms / 1000).toFixed(1)} s):</Text>
              <Text style={styles.gemma}>{mine.gemma}</Text>
            </View>
          ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  head: { fontFamily: fonts.groteskSemi, fontSize: 14, color: colors.ink },
  note: { fontFamily: fonts.inter, fontSize: 12, color: colors.muted, lineHeight: 17 },
  small: { fontFamily: fonts.inter, fontSize: 12, color: colors.muted, lineHeight: 17 },
  mono: { fontFamily: fonts.mono, fontSize: 11, color: colors.ink },
  picked: { color: colors.ink, fontFamily: fonts.interSemi },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  ok: { fontFamily: fonts.interSemi, fontSize: 12.5, color: colors.good },
  err: { fontFamily: fonts.interSemi, fontSize: 12, color: colors.errInk },
  score: { fontFamily: fonts.groteskSemi, fontSize: 14, color: colors.primaryInk },
  result: { fontFamily: fonts.inter, fontSize: 12.5, color: colors.ink, lineHeight: 18 },
  input: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.control,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontFamily: fonts.inter,
    fontSize: 13.5,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  compare: { gap: 4, padding: 10, borderRadius: radius.control, backgroundColor: colors.surface2 },
  answer: { fontFamily: fonts.inter, fontSize: 13.5, color: colors.ink, lineHeight: 19 },
  gemma: { fontFamily: fonts.interItalic, fontSize: 13.5, color: colors.cloudInk, lineHeight: 19 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 6 },
});
