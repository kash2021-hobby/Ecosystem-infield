import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { api } from "@/api";
import { ScreenShell } from "@/chrome";
import { loadSession } from "@/session";
import { colors, styles } from "@/theme";

type Row = { day: string; person: string; phone: string; site: string | null; late: boolean; checkedInAt: string };
type Report = { from: string; to: string; totals: { people: number; checkins: number; late: number }; rows: Row[] };
type Checkin = { person: string; phone: string; site: string | null; late: boolean; checkedInAt?: string; checked_in_at?: string };
type Employee = { phone: string; status: string };
type Site = { id: string; name: string };

const labels = ["S", "M", "T", "W", "T", "F", "S"];

function daysBetween(from: string, to: string) {
  const list: string[] = [];
  let current = from;
  while (current <= to) {
    list.push(current);
    current = shiftDay(current, 1);
  }
  return list;
}

function shiftDay(day: string, days: number) {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + days));
  return next.toISOString().slice(0, 10);
}

function formatRange(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const month = end.toLocaleDateString("en-IN", { month: "short" });
  return `${start.getDate()} – ${end.getDate()} ${month}`;
}

function weekday(day: string) {
  return labels[new Date(`${day}T00:00:00`).getDay()];
}

function rate(rows: Row[], roster: number, from: string, to: string) {
  if (!roster) return 0;
  const span = daysBetween(from, to);
  const present = new Set(rows.map((row) => `${row.day}:${row.phone}`)).size;
  return Math.round((present / (roster * span.length)) * 100);
}

export default function Attendance() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [today, setToday] = useState<Checkin[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [roster, setRoster] = useState(0);
  const [previous, setPrevious] = useState<Row[]>([]);
  const [error, setError] = useState("");

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
    const [report, attendance, employees, siteList] = await Promise.all([
      api<Report>("/reports/attendance", {}, session.token),
      api<{ checkins: Checkin[] }>("/attendance", {}, session.token),
      api<{ employees: Employee[] }>("/employees", {}, session.token),
      api<{ sites: Site[] }>("/sites", {}, session.token),
    ]);
    const active = employees.employees.filter((person) => person.status === "active").length;
    setFrom(report.from);
    setTo(report.to);
    setRows(report.rows);
    setToday(attendance.checkins);
    setSites(siteList.sites);
    setRoster(active);
    const priorFrom = shiftDay(report.from, -7);
    const priorTo = shiftDay(report.to, -7);
    const prior = await api<Report>(`/reports/attendance?from=${priorFrom}&to=${priorTo}`, {}, session.token);
    setPrevious(prior.rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  const week = useMemo(() => {
    if (!from || !to) return [];
    return daysBetween(from, to).map((day) => ({
      day,
      label: weekday(day),
      count: new Set(rows.filter((row) => row.day === day).map((row) => row.phone)).size,
    }));
  }, [from, to, rows]);

  const maxBar = Math.max(roster, ...week.map((day) => day.count), 1);
  const weekly = rate(rows, roster, from, to);
  const lastWeek = previous.length ? rate(previous, roster, shiftDay(from, -7), shiftDay(to, -7)) : null;
  const delta = lastWeek === null ? null : weekly - lastWeek;
  const todayKey = to;
  const bySite = sites.map((site) => {
    const phones = new Set(today.filter((row) => row.site === site.name).map((row) => row.phone));
    return { name: site.name, present: phones.size, late: today.filter((row) => row.late && row.site === site.name).length };
  });
  const recent = [...today]
    .sort((a, b) => String(b.checkedInAt ?? b.checked_in_at).localeCompare(String(a.checkedInAt ?? a.checked_in_at)))
    .slice(0, 8);

  function when(row: Checkin) {
    const stamp = row.checkedInAt ?? row.checked_in_at;
    if (!stamp) return "";
    return new Date(stamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <ScreenShell>
    <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ padding: 20, paddingBottom: 24 }}>
      <Text style={styles.sub}>{from && to ? formatRange(from, to) : "This week"} · {roster} on the roster</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.card}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
          <Text style={{ fontSize: 44, fontWeight: "700", color: colors.ink, letterSpacing: -1, lineHeight: 48 }}>{weekly}%</Text>
          <View style={{ paddingBottom: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.ink }}>Weekly attendance</Text>
            {delta === null ? (
              <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>People who checked in, over roster × days</Text>
            ) : (
              <Text style={{ fontSize: 11, fontWeight: "600", color: delta >= 0 ? colors.greenDeep : colors.coral, marginTop: 2 }}>
                {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% vs last week
              </Text>
            )}
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, height: 100, marginTop: 18 }}>
          {week.map((day) => (
            <View key={day.day} style={{ flex: 1, alignItems: "center", gap: 6 }}>
              <View
                style={{
                  width: "100%",
                  height: Math.max((day.count / maxBar) * 80, day.count ? 6 : 2),
                  borderRadius: 6,
                  backgroundColor: day.day === todayKey ? colors.green : colors.greenSoft,
                }}
              />
              <Text style={{ fontSize: 10, color: colors.ink3, fontWeight: "600" }}>{day.label}</Text>
            </View>
          ))}
        </View>
        <Text style={[styles.sub, { marginTop: 12, marginBottom: 0 }]}>
          {rows.length} check-ins · {new Set(rows.map((row) => row.phone)).size} people · {rows.filter((row) => row.late).length} late
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink, marginBottom: 12 }}>By site — today</Text>
        {bySite.length === 0 ? <Text style={[styles.sub, { marginBottom: 0 }]}>No sites yet.</Text> : null}
        {bySite.map((site) => {
          const share = roster ? site.present / roster : 0;
          const tone = share > 0.9 ? colors.green : share > 0.5 ? colors.amber : colors.coral;
          return (
            <View key={site.name} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: "500", color: colors.ink, flex: 1 }}>{site.name}</Text>
                <Text style={{ fontSize: 12, color: colors.ink3 }}>
                  {site.present}/{roster}
                  {site.late ? ` · ${site.late} late` : ""}
                </Text>
              </View>
              <View style={{ height: 6, borderRadius: 999, backgroundColor: colors.cream2, overflow: "hidden" }}>
                <View style={{ height: "100%", width: `${Math.round(share * 100)}%`, backgroundColor: roster ? tone : colors.ink4 }} />
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.card}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink, marginBottom: 8 }}>Recent check-ins</Text>
        {recent.length === 0 ? <Text style={[styles.sub, { marginBottom: 0 }]}>Nobody has checked in today.</Text> : null}
        {recent.map((row) => (
          <View key={`${row.phone}-${when(row)}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.cream2 }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.cream2, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontWeight: "700", color: colors.ink }}>{row.person.slice(0, 1).toUpperCase()}</Text>
            </View>
            <Text style={{ flex: 1, fontSize: 13, fontWeight: "500", color: colors.ink }}>{row.person}</Text>
            <Text style={{ fontSize: 12, color: row.late ? colors.coral : colors.ink3 }}>{row.late ? "Late · " : ""}{row.site ?? "—"}</Text>
            <Text style={{ fontSize: 12, color: colors.ink3 }}>{when(row)}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
    </ScreenShell>
  );
}
