import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { api } from "@/api";
import { ScreenShell } from "@/chrome";
import { loadSession } from "@/session";
import { colors, styles } from "@/theme";

type Item = {
  id: string;
  title: string;
  narrative: string;
  citation: string;
  suggestionTitle: string | null;
  status: string;
  taskId?: string | null;
};

function toneFor(title: string) {
  if (/late/i.test(title)) return { label: "Gap detected", color: colors.coral, background: colors.coralSoft, accent: colors.coral };
  if (/alert/i.test(title)) return { label: "Risk", color: "#8A5A10", background: "#F8EFD6", accent: colors.amber };
  return { label: "Note", color: colors.greenDeep, background: colors.greenSoft, accent: colors.green };
}

export default function InsightDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const session = await loadSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    if (session.user.role === "employee") {
      router.replace("/check-in");
      return;
    }
    const body = await api<{ items: Item[] }>("/brief", {}, session.token);
    const found = body.items.find((row) => row.id === id) ?? null;
    setItem(found);
    if (!found) setError("This insight is not in this week's brief.");
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      setError("");
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  async function act(action: "accept" | "dismiss") {
    const session = await loadSession();
    if (!session || !item) return;
    setError("");
    try {
      const result = await api<{ taskId?: string }>(`/brief/${item.id}/${action}`, { method: "POST", body: "{}" }, session.token);
      if (action === "accept") {
        setNotice("Accepted. A task was created.");
        if (result.taskId) {
          router.replace(`/task/${result.taskId}`);
          return;
        }
      } else {
        setNotice("Dismissed. Nothing else changed.");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    }
  }

  const tone = item ? toneFor(item.title) : null;

  return (
    <ScreenShell>
      <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ padding: 20, paddingBottom: 24 }}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {item && tone ? (
          <>
            <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: tone.accent }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <View style={{ backgroundColor: tone.background, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: tone.color, fontSize: 11, fontWeight: "700" }}>{tone.label}</Text>
                </View>
                <Text style={{ fontSize: 10, color: colors.ink3, textTransform: "capitalize" }}>{item.status}</Text>
              </View>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.ink, lineHeight: 20 }}>{item.title}</Text>
              <Text style={{ fontSize: 13, color: colors.ink3, marginTop: 8, lineHeight: 20 }}>{item.narrative}</Text>
            </View>

            <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.ink3, marginBottom: 8 }}>
              Why this showed up
            </Text>
            <View style={styles.card}>
              <Text style={{ fontSize: 13, color: colors.ink, lineHeight: 20 }}>
                Cited from {item.citation}. The weekly brief only uses this week’s late check-ins and open alerts. It does not invent a 6-week drop or a route optimisation.
              </Text>
            </View>

            {item.status === "pending" ? (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable onPress={() => act("dismiss")} style={[styles.button, styles.secondary, { flex: 1 }]}>
                  <Text style={[styles.buttonText, styles.secondaryText]}>Dismiss</Text>
                </Pressable>
                {item.suggestionTitle ? (
                  <Pressable onPress={() => act("accept")} style={[styles.button, { flex: 1 }]}>
                    <Text style={styles.buttonText}>Accept</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {item.suggestionTitle && item.status === "pending" ? (
              <Text style={[styles.sub, { marginTop: 8 }]}>Accept creates a task: {item.suggestionTitle}</Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </ScreenShell>
  );
}
