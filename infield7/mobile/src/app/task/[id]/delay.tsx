import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { api } from "@/api";
import { loadSession, type Session } from "@/session";
import { colors, styles } from "@/theme";
import type { TaskDetail } from "@/taskDetail";

const reasons = ["Customer unavailable", "Stock shortage", "Traffic / travel", "Waiting on approval", "Payment issue", "Other"];

export default function DelayAlert() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [reason, setReason] = useState(reasons[0]);
  const [detail, setDetail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const current = await loadSession();
        if (!current || !id) return;
        setSession(current);
        setTask(await api<TaskDetail>(`/tasks/${id}`, {}, current.token));
      })().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [id]),
  );

  async function submit() {
    if (!session || !id) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/tasks/${id}/delay`, { method: "POST", body: JSON.stringify({ reason, detail: detail || undefined }) }, session.token);
      setNotice("Your manager can see this on Alerts now.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
      <Text style={styles.sub}>{task?.title ?? "This task"}</Text>
      <View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.coralSoft, marginBottom: 16 }}>
        <Text style={{ fontSize: 13, color: colors.ink, lineHeight: 18 }}>
          Managers see this on Alerts immediately. Later steps in the workflow stay on the list; they are not paused automatically.
        </Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.6, color: colors.ink3, marginBottom: 8 }}>REASON</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {reasons.map((item) => (
          <Pressable
            key={item}
            onPress={() => setReason(item)}
            style={{ backgroundColor: item === reason ? colors.ink : colors.paper, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 }}
          >
            <Text style={{ color: item === reason ? colors.paper : colors.ink, fontSize: 12, fontWeight: "600" }}>{item}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.6, color: colors.ink3, marginBottom: 8 }}>WHAT HAPPENED</Text>
      <TextInput
        style={[styles.input, { minHeight: 80 }]}
        value={detail}
        onChangeText={setDetail}
        placeholder="A short note for the manager"
        placeholderTextColor={colors.ink3}
        multiline
      />
      <Pressable onPress={submit} disabled={busy} style={styles.button}>
        <Text style={styles.buttonText}>{busy ? "Sending…" : "Send delay alert"}</Text>
      </Pressable>
      {notice ? (
        <Pressable onPress={() => router.back()} style={[styles.button, styles.secondary]}>
          <Text style={[styles.buttonText, styles.secondaryText]}>Back to task</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
