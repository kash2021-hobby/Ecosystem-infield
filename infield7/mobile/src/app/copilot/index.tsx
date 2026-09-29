import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
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

type Employee = { status: string };
type Task = { id: string };
type Report = { people: { presentDays: number }[]; rows?: { day: string }[] };

function toneFor(title: string): { label: string; color: string; background: string; accent: string } {
  if (/late/i.test(title)) return { label: "Gap detected", color: colors.coral, background: colors.coralSoft, accent: colors.coral };
  if (/alert/i.test(title)) return { label: "Risk", color: "#8A5A10", background: "#F8EFD6", accent: colors.amber };
  return { label: "Note", color: colors.greenDeep, background: colors.greenSoft, accent: colors.green };
}

function shiftDay(day: string, delta: number) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + delta)).toISOString().slice(0, 10);
}

export default function CopilotHome() {
  const [week, setWeek] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [people, setPeople] = useState(0);
  const [tasks, setTasks] = useState(0);
  const [days, setDays] = useState(0);
  const [months, setMonths] = useState(0);
  const [signal, setSignal] = useState(0);
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
    const today = new Date().toISOString().slice(0, 10);
    const from = shiftDay(today, -90);
    const [brief, roster, taskList, report] = await Promise.all([
      api<{ weekStart: string; items: Item[] }>("/brief", {}, session.token),
      api<{ employees: Employee[] }>("/employees", {}, session.token),
      api<{ tasks: Task[] }>("/tasks", {}, session.token),
      api<Report>(`/reports/attendance?from=${from}&to=${today}`, {}, session.token),
    ]);
    const uniqueDays = new Set((report.rows ?? []).map((row) => row.day));
    const dayCount = uniqueDays.size;
    const oldest = [...uniqueDays].sort()[0];
    const monthSpan = oldest
      ? Math.max(1, Math.round((Date.parse(today) - Date.parse(oldest)) / (30 * 86_400_000)))
      : 0;
    setWeek(brief.weekStart);
    setItems(brief.items);
    setPeople(roster.employees.filter((person) => person.status === "active").length);
    setTasks(taskList.tasks.length);
    setDays(dayCount);
    setMonths(monthSpan);
    setSignal(Math.min(100, Math.round((dayCount / 21) * 100)));
  }, []);

  useFocusEffect(
    useCallback(() => {
      setError("");
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  async function dismiss(id: string) {
    const session = await loadSession();
    if (!session) return;
    setError("");
    try {
      await api(`/brief/${id}/dismiss`, { method: "POST", body: "{}" }, session.token);
      setNotice("Dismissed. Nothing else changed.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not dismiss");
    }
  }

  const pending = items.filter((item) => item.status === "pending");
  const shown = pending.length ? pending : items;

  return (
    <ScreenShell>
      <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: 24 }}>
        <Text style={[styles.sub, { paddingHorizontal: 20, paddingTop: 4 }]}>
          Quiet analyst for your team{week ? ` · week of ${week}` : ""}
        </Text>
        {error ? (
          <Text style={[styles.error, { marginHorizontal: 20 }]}>
            {error}
            {error.includes("Credits") ? " Open billing on the website." : ""}
          </Text>
        ) : null}
        {notice ? <Text style={[styles.notice, { marginHorizontal: 20 }]}>{notice}</Text> : null}

        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <View style={styles.card}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: colors.paper, fontWeight: "700", fontSize: 13 }}>AI</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>Learning from your team</Text>
                <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 3, lineHeight: 16 }}>
                  {months ? `${months} month${months === 1 ? "" : "s"}` : "New workspace"} · {people} people · {tasks} task{tasks === 1 ? "" : "s"}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.green }} />
                <Text style={{ fontSize: 9, color: colors.greenDeep, fontWeight: "700", letterSpacing: 0.6, marginTop: 3 }}>LIVE</Text>
              </View>
            </View>
            <View style={{ marginTop: 14 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
                <Text style={{ fontSize: 10, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase", color: colors.ink3 }}>
                  Signal strength
                </Text>
                <Text style={{ fontSize: 10, fontWeight: "700", color: colors.ink }}>{signal}%</Text>
              </View>
              <View style={{ height: 6, borderRadius: 4, backgroundColor: colors.cream2, overflow: "hidden" }}>
                <View style={{ width: `${signal}%`, height: "100%", backgroundColor: colors.green }} />
              </View>
              <Text style={{ fontSize: 10, color: colors.ink3, marginTop: 6, lineHeight: 15 }}>
                {days} distinct check-in day{days === 1 ? "" : "s"} in the last 90. Twenty-one days fills this bar. More days, sharper notes.
              </Text>
            </View>
          </View>
          <Pressable onPress={() => router.push("/copilot/briefing")} style={[styles.card, { marginTop: 8, flexDirection: "row", alignItems: "center" }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>Weekly brief</Text>
              <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 3 }}>Last seven days: wins, slips and one thing to do</Text>
            </View>
            <Text style={{ fontSize: 13, color: colors.ink3 }}>→</Text>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 20, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.ink3 }}>
            {shown.length} insight{shown.length === 1 ? "" : "s"} for you today
          </Text>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.cream2 }} />
        </View>

        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          {shown.length === 0 ? <Text style={styles.sub}>No brief items this week.</Text> : null}
          {shown.map((item) => {
            const tone = toneFor(item.title);
            return (
              <View key={item.id} style={[styles.card, { borderLeftWidth: 4, borderLeftColor: tone.accent }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <View style={{ backgroundColor: tone.background, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ color: tone.color, fontSize: 11, fontWeight: "700" }}>{tone.label}</Text>
                  </View>
                  <Text style={{ fontSize: 10, color: colors.ink3 }}>{item.citation}</Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.ink, lineHeight: 18 }}>{item.title}</Text>
                <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 6 }}>{item.narrative}</Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 12, alignItems: "center" }}>
                  <Pressable onPress={() => router.push(`/copilot/${item.id}`)}>
                    <Text style={{ fontSize: 11, fontWeight: "600", color: colors.ink }}>Show why →</Text>
                  </Pressable>
                  <View style={{ flex: 1 }} />
                  {item.status === "pending" ? (
                    <>
                      <Pressable onPress={() => dismiss(item.id)} style={[styles.button, styles.secondary, { marginTop: 0, paddingVertical: 8, paddingHorizontal: 12 }]}>
                        <Text style={[styles.buttonText, styles.secondaryText, { fontSize: 11 }]}>Dismiss</Text>
                      </Pressable>
                      <Pressable onPress={() => router.push(`/copilot/${item.id}`)} style={[styles.button, { marginTop: 0, paddingVertical: 8, paddingHorizontal: 12 }]}>
                        <Text style={[styles.buttonText, { fontSize: 11 }]}>Review</Text>
                      </Pressable>
                    </>
                  ) : (
                    <Text style={{ fontSize: 11, color: colors.ink3, textTransform: "capitalize" }}>{item.status}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
          <View style={{ padding: 12, borderRadius: 10, backgroundColor: colors.paper, borderWidth: 1, borderStyle: "dashed", borderColor: colors.ink4, flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Text style={{ fontSize: 10, color: colors.ink3, lineHeight: 15, flex: 1 }}>
              AI never acts on its own. It only surfaces patterns from check-ins and alerts — you decide what to do.
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}
