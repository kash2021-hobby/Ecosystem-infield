import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { api } from "@/api";
import { ScreenShell } from "@/chrome";
import { loadSession, type Session } from "@/session";
import { colors, styles } from "@/theme";

type Leave = { id: string; person: string; startDate: string; endDate: string; reason: string | null; status: string };

const day = /^\d{4}-\d{2}-\d{2}$/;

export default function LeaveScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<Leave[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async (current?: Session) => {
    const sessionNow = current ?? (await loadSession());
    if (!sessionNow) return;
    setSession(sessionNow);
    const body = await api<{ requests: Leave[] }>("/leave", {}, sessionNow.token);
    setRows(body.requests);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  async function submit() {
    if (!session) return;
    if (!day.test(startDate) || !day.test(endDate)) {
      setError("Use dates like 2026-09-29");
      return;
    }
    setError("");
    setNotice("");
    try {
      await api("/leave", {
        method: "POST",
        body: JSON.stringify({ startDate, endDate, reason }),
      }, session.token);
      setReason("");
      setNotice("Request sent. A manager still has to approve it.");
      await refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request leave");
    }
  }

  async function decide(id: string, status: "approved" | "rejected") {
    if (!session) return;
    setError("");
    try {
      await api(`/leave/${id}`, { method: "POST", body: JSON.stringify({ status }) }, session.token);
      await refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update leave");
    }
  }

  const manager = session?.user.role !== "employee";

  return (
    <ScreenShell>
    <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ padding: 20, paddingBottom: 24 }}>
      <Text style={styles.sub}>
        {manager ? "Approve or reject a request, or ask for your own days away." : "Ask for days away. Nothing is approved until a manager decides."}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <Text style={styles.label}>From</Text>
      <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="2026-09-29" placeholderTextColor={colors.ink3} />
      <Text style={styles.label}>To</Text>
      <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholder="2026-09-30" placeholderTextColor={colors.ink3} />
      <Text style={styles.label}>Reason</Text>
      <TextInput style={styles.input} value={reason} onChangeText={setReason} placeholder="Family visit" placeholderTextColor={colors.ink3} />
      <Pressable style={styles.button} onPress={submit}>
        <Text style={styles.buttonText}>Request leave</Text>
      </Pressable>
      {rows.length === 0 ? <Text style={[styles.sub, { marginTop: 16 }]}>No leave requests.</Text> : null}
      {rows.map((row) => (
        <View key={row.id} style={[styles.card, { marginTop: 12 }]}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.ink }}>{row.person}</Text>
          <Text style={styles.sub}>{row.startDate} to {row.endDate}</Text>
          <Text style={styles.sub}>{row.reason || "No reason"} · {row.status}</Text>
          {manager && row.status === "pending" ? (
            <View style={styles.row}>
              <Pressable style={[styles.button, { flex: 1 }]} onPress={() => decide(row.id, "approved")}>
                <Text style={styles.buttonText}>Approve</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.secondary, { flex: 1 }]} onPress={() => decide(row.id, "rejected")}>
                <Text style={[styles.buttonText, styles.secondaryText]}>Reject</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ))}
    </ScrollView>
    </ScreenShell>
  );
}
