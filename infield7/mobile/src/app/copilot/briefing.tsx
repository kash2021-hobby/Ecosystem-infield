import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, type Href } from "expo-router";
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
};
type Task = { id: string; status: string; dueOn: string | null; lastAt: string | null };
type Alert = { id: string; status: string };
type Row = { day: string; phone: string; late: boolean };

type Week = {
  from: string;
  to: string;
  checkins: number;
  previousCheckins: number;
  people: number;
  roster: number;
  late: number;
  previousLate: number;
  closed: number;
  overdue: number;
  openAlerts: number;
  fixes: Item[];
};

function shiftDay(day: string, delta: number) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + delta)).toISOString().slice(0, 10);
}

function isoWeek(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

function shortDate(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

function versus(now: number, before: number) {
  if (now === before) return "same as the week before";
  return `${now > before ? "up" : "down"} from ${before} the week before`;
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function Section({ label, color, children, cite }: { label: string; color: string; children: string; cite: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.ink3 }}>{label}</Text>
      </View>
      <Text style={{ fontSize: 13, color: colors.ink, lineHeight: 19 }}>{children}</Text>
      <Text style={{ fontSize: 10, color: colors.ink3, marginTop: 3 }}>{cite}</Text>
    </View>
  );
}

export default function WeeklyBriefing() {
  const [week, setWeek] = useState<Week | null>(null);
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
    const from = shiftDay(today, -6);
    const previousFrom = shiftDay(today, -13);
    const [brief, roster, taskList, alertList, report] = await Promise.all([
      api<{ items: Item[] }>("/brief", {}, session.token),
      api<{ employees: { status: string }[] }>("/employees", {}, session.token),
      api<{ tasks: Task[] }>("/tasks", {}, session.token),
      api<{ alerts: Alert[] }>("/alerts", {}, session.token),
      api<{ rows: Row[] }>(`/reports/attendance?from=${previousFrom}&to=${today}`, {}, session.token),
    ]);
    const current = report.rows.filter((row) => row.day >= from);
    const previous = report.rows.filter((row) => row.day < from);
    setWeek({
      from,
      to: today,
      checkins: current.length,
      previousCheckins: previous.length,
      people: new Set(current.map((row) => row.phone)).size,
      roster: roster.employees.filter((person) => person.status === "active").length,
      late: current.filter((row) => row.late).length,
      previousLate: previous.filter((row) => row.late).length,
      closed: taskList.tasks.filter((task) => task.status === "done" && task.lastAt && task.lastAt.slice(0, 10) >= from).length,
      overdue: taskList.tasks.filter((task) => task.status !== "done" && task.dueOn && task.dueOn.slice(0, 10) < today).length,
      openAlerts: alertList.alerts.filter((alert) => alert.status === "open" || alert.status === "escalated").length,
      fixes: brief.items.filter((item) => item.status === "pending" && item.suggestionTitle),
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      setError("");
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  async function accept(id: string) {
    const session = await loadSession();
    if (!session) return;
    setError("");
    try {
      const result = await api<{ taskId?: string }>(`/brief/${id}/accept`, { method: "POST", body: "{}" }, session.token);
      if (result.taskId) {
        router.push(`/task/${result.taskId}`);
        return;
      }
      setNotice("Accepted. A task was created.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept");
    }
  }

  const watchCount = week ? [week.late, week.overdue, week.openAlerts].filter(Boolean).length : 0;
  const headline = !week
    ? ""
    : week.checkins === 0
      ? "A quiet week. No check-ins yet."
      : watchCount === 0
        ? "A clean week. Keep the rhythm."
        : `Solid week, ${plural(watchCount, "thing")} to watch.`;

  const actions: { key: string; label: string; onPress: () => void }[] = week
    ? [
        ...week.fixes.map((item) => ({ key: item.id, label: item.suggestionTitle ?? item.title, onPress: () => accept(item.id) })),
        ...(week.openAlerts ? [{ key: "alerts", label: `Review ${plural(week.openAlerts, "open alert")}`, onPress: () => router.push("/alerts" as Href) }] : []),
        ...(week.overdue ? [{ key: "overdue", label: `Chase ${plural(week.overdue, "overdue task")}`, onPress: () => router.push("/tasks" as Href) }] : []),
      ]
    : [];

  return (
    <ScreenShell>
      <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ padding: 20, paddingBottom: 24 }}>
        {error ? (
          <Text style={styles.error}>
            {error}
            {error.includes("Credits") ? " Open billing on the website." : ""}
          </Text>
        ) : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {!week && !error ? <Text style={styles.sub}>Reading last week…</Text> : null}

        {week ? (
          <>
            <View style={[styles.card, { padding: 18 }]}>
              <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.greenDeep }}>
                Week {isoWeek(week.from)} · InField brief
              </Text>
              <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 4 }}>
                {shortDate(week.from)} – {shortDate(week.to)} · from live data
              </Text>
              <Text style={{ fontSize: 20, fontWeight: "700", color: colors.ink, marginTop: 10, marginBottom: 16, lineHeight: 26 }}>{headline}</Text>

              <Section label="On track" color={colors.green} cite={`source: check-ins and task log, ${shortDate(week.from)} – ${shortDate(week.to)}`}>
                {week.checkins
                  ? `${plural(week.checkins, "check-in")} from ${week.people} of ${week.roster} people, ${versus(week.checkins, week.previousCheckins)}. ${plural(week.closed, "task")} closed.`
                  : `No check-ins in the last seven days. ${plural(week.closed, "task")} closed.`}
              </Section>

              <Section label="Slipping" color={colors.amber} cite="source: late flag on check-ins">
                {week.late
                  ? `${plural(week.late, "late check-in")}, ${versus(week.late, week.previousLate)}.`
                  : "Every check-in landed on time."}
              </Section>

              <Section label="Watch this" color={colors.coral} cite="source: alerts and task due dates">
                {week.openAlerts || week.overdue
                  ? [week.openAlerts ? `${plural(week.openAlerts, "alert")} still open` : "", week.overdue ? `${plural(week.overdue, "task")} past due` : ""]
                      .filter(Boolean)
                      .join(" and ") + "."
                  : "No open alerts and nothing past due."}
              </Section>

              <Section label="One thing to do" color={colors.ink} cite={week.fixes[0] ? week.fixes[0].citation : "source: this week's brief"}>
                {week.fixes[0] ? `${week.fixes[0].suggestionTitle}. ${week.fixes[0].narrative}` : "Nothing pressing. The brief has no open suggestions."}
              </Section>
            </View>

            <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.ink3, marginTop: 18, marginBottom: 8 }}>
              Turn it into action
            </Text>
            {actions.length === 0 ? <Text style={styles.sub}>Nothing to act on this week.</Text> : null}
            <View style={{ gap: 8 }}>
              {actions.map((action) => (
                <Pressable key={action.key} onPress={action.onPress} style={[styles.card, { flexDirection: "row", alignItems: "center" }]}>
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: colors.ink }}>{action.label}</Text>
                  <Text style={{ fontSize: 13, color: colors.ink3 }}>→</Text>
                </Pressable>
              ))}
            </View>

            <Text style={{ fontSize: 10, color: colors.ink3, marginTop: 16, lineHeight: 15 }}>
              Built only from check-ins, tasks and alerts. Suggestions become tasks only when you tap them.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </ScreenShell>
  );
}
