/**
 * Drop this file in MemoAirem at src/components/HarborSync.tsx
 * and render <HarborSync /> inside Settings.
 */
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "../theme/tokens";
import { loadSyncConfig, saveSyncConfig, syncNow } from "../lib/sync";

export function HarborSync({ active = true }: { active?: boolean }) {
  const current = loadSyncConfig();
  const [baseUrl, setBaseUrl] = useState(current?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState(current?.apiKey ?? "");
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    const next = loadSyncConfig();
    setBaseUrl(next?.baseUrl ?? "");
    setApiKey(next?.apiKey ?? "");
  }, [active]);

  return (
    <View style={styles.box}>
      <Text style={styles.heading}>Harbor</Text>
      <Text style={styles.copy}>
        The HTTPS address from Connect, and a read-write key. Saves on this phone show up there, and Muse can ask about them.
      </Text>
      <Text style={styles.label}>Address</Text>
      <TextInput
        value={baseUrl}
        onChangeText={setBaseUrl}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="https://your-harbor-host"
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      <Text style={styles.label}>API key</Text>
      <TextInput
        value={apiKey}
        onChangeText={setApiKey}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        placeholder="hbr_..."
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      <Pressable
        style={styles.button}
        onPress={() => {
          saveSyncConfig({ baseUrl, apiKey });
          setSaved(true);
          setStatus("Syncing…");
          void syncNow().then(
            (report) => setStatus(report.message),
            (error) => setStatus(`Harbor sync stopped: ${(error as Error)?.message ?? error}`),
          );
        }}
      >
        <Text style={styles.buttonText}>{saved ? "Saved" : "Save Harbor link"}</Text>
      </Pressable>
      {status ? <Text style={styles.copy}>{status}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, paddingVertical: 12 },
  heading: { color: colors.ink, fontSize: 18, fontWeight: "600" },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  label: { color: colors.ink, fontSize: 13, marginTop: 6 },
  input: {
    borderColor: colors.line,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  button: {
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: 10,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
