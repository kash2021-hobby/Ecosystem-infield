import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { api } from "@/api";
import { ScreenShell } from "@/chrome";
import { loadSession, type Session } from "@/session";
import { colors, styles } from "@/theme";

type Alert = { id: string; kind: string; message: string; status: string; createdAt: string; person: string | null };

const clock = /^\d{2}:\d{2}$/;

export default function AlertsScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [start, setStart] = useState("22:00");
  const [end, setEnd] = useState("07:00");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async (current?: Session) => {
    const sessionNow = current ?? (await loadSession());
    if (!sessionNow) return;
    setSession(sessionNow);
    const body = await api<{ alerts: Alert[]; quietHours: { startTime: string; endTime: string } }>(
      "/alerts",
      {},
      sessionNow.token,
    );
    setAlerts(body.alerts);
    setStart(body.quietHours.startTime.slice(0, 5));
    setEnd(body.quietHours.endTime.slice(0, 5));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  async function acknowledge(id: string) {
    if (!session) return;
    setError("");
    try {
      await api(`/alerts/${id}/acknowledge`, { method: "POST", body: "{}" }, session.token);
      await refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not acknowledge");
    }
  }

  async function saveHours() {
    if (!session) return;
    if (!clock.test(start) || !clock.test(end)) {
      setError("Use times like 22:00");
      return;
    }
    setError("");
    setNotice("");
    try {
      await api("/quiet-hours", { method: "POST", body: JSON.stringify({ startTime: start, endTime: end }) }, session.token);
      setNotice("Quiet hours saved. Late check-ins and fence exits wait. SOS still comes through.");
      await refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }

  return (
    <ScreenShell>
    <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ padding: 20, paddingBottom: 24 }}>
      <Text style={styles.sub}>Late check-in and leaving a site stay quiet overnight. An SOS still comes through.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {alerts.length === 0 ? <Text style={styles.sub}>No alerts yet.</Text> : null}
      {alerts.map((alert) => (
        <View key={alert.id} style={styles.card}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.ink }}>{alert.message}</Text>
          <Text style={styles.sub}>
            {alert.person ? `${alert.person} · ` : ""}
            {alert.status} · {new Date(alert.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </Text>
          {alert.status !== "acknowledged" ? (
            <Pressable style={styles.button} onPress={() => acknowledge(alert.id)}>
              <Text style={styles.buttonText}>Acknowledge</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      <Text style={styles.label}>Quiet from</Text>
      <TextInput style={styles.input} value={start} onChangeText={setStart} placeholder="22:00" placeholderTextColor={colors.ink3} />
      <Text style={styles.label}>Until</Text>
      <TextInput style={styles.input} value={end} onChangeText={setEnd} placeholder="07:00" placeholderTextColor={colors.ink3} />
      <Pressable style={[styles.button, styles.secondary]} onPress={saveHours}>
        <Text style={[styles.buttonText, styles.secondaryText]}>Save quiet hours</Text>
      </Pressable>
    </ScrollView>
    </ScreenShell>
  );
}
