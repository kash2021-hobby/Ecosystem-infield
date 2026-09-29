import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { api } from "@/api";
import { ScreenShell } from "@/chrome";
import { loadSession } from "@/session";
import { colors, styles } from "@/theme";

type Employee = { userId: string | null; name: string; phone: string; role: string; status: string };
type Person = { userId: string; site: string | null; recordedAt: string };
type Checkin = { phone: string };
type Alert = { userId: string | null; status: string };

type Place = "on-site" | "field" | "alert" | "offline";

const dot: Record<Place, string> = {
  "on-site": colors.green,
  field: colors.amber,
  alert: colors.coral,
  offline: colors.ink4,
};

export default function Team() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [presence, setPresence] = useState<Person[]>([]);
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set());
  const [alertUsers, setAlertUsers] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | Place>("all");
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
    const [roster, live, attendance, alerts] = await Promise.all([
      api<{ employees: Employee[] }>("/employees", {}, session.token),
      api<{ people: Person[] }>("/presence", {}, session.token),
      api<{ checkins: Checkin[] }>("/attendance", {}, session.token),
      api<{ alerts: Alert[] }>("/alerts", {}, session.token),
    ]);
    setEmployees(roster.employees.filter((person) => person.status === "active"));
    setPresence(live.people);
    setCheckedIn(new Set(attendance.checkins.map((row) => row.phone)));
    setAlertUsers(new Set(alerts.alerts.filter((alert) => alert.userId && (alert.status === "open" || alert.status === "escalated")).map((alert) => alert.userId as string)));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  const rows = useMemo(() => {
    const byUser = new Map(presence.map((person) => [person.userId, person]));
    return employees.map((person) => {
      const live = person.userId ? byUser.get(person.userId) : undefined;
      const place: Place = person.userId && alertUsers.has(person.userId)
        ? "alert"
        : live?.site
          ? "on-site"
          : live
            ? "field"
            : "offline";
      const where = place === "alert"
        ? "Open alert"
        : place === "on-site"
          ? live?.site ?? "On-site"
          : place === "field"
            ? "Field"
            : "Offline";
      return { ...person, place, where };
    });
  }, [employees, presence, alertUsers]);

  const needle = query.trim().toLowerCase();
  const visible = rows.filter((person) => {
    if (tab !== "all" && person.place !== tab) return false;
    if (!needle) return true;
    return person.name.toLowerCase().includes(needle) || person.phone.includes(needle);
  });

  const counts = {
    all: rows.length,
    "on-site": rows.filter((person) => person.place === "on-site").length,
    field: rows.filter((person) => person.place === "field").length,
    alert: rows.filter((person) => person.place === "alert").length,
  };
  const inToday = rows.filter((person) => checkedIn.has(person.phone)).length;

  return (
    <ScreenShell>
    <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ padding: 20, paddingBottom: 24 }}>
      <Text style={styles.sub}>
        {counts.all} employee{counts.all === 1 ? "" : "s"} · {inToday} checked in
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search name or phone"
        placeholderTextColor={colors.ink3}
        style={styles.input}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
        <Tab label={`All ${counts.all}`} active={tab === "all"} onPress={() => setTab("all")} />
        <Tab label={`On-site ${counts["on-site"]}`} active={tab === "on-site"} onPress={() => setTab("on-site")} />
        <Tab label={`Field ${counts.field}`} active={tab === "field"} onPress={() => setTab("field")} />
        <Tab label={`Alerts ${counts.alert}`} active={tab === "alert"} onPress={() => setTab("alert")} />
      </ScrollView>
      {visible.length === 0 ? <Text style={styles.sub}>No one in this list.</Text> : null}
      {visible.map((person) => {
        const open = person.place === "alert"
          ? () => router.push("/alerts")
          : person.userId && person.place !== "offline"
            ? () => router.push({ pathname: "/map", params: { userId: person.userId ?? "" } })
            : null;
        const body = (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.cream2, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontWeight: "700", color: colors.ink }}>{person.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ position: "absolute", right: -1, bottom: -1, width: 14, height: 14, borderRadius: 7, backgroundColor: dot[person.place], borderWidth: 2, borderColor: colors.paper }} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink }}>{person.name}</Text>
              <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>{person.role}</Text>
            </View>
            <View style={{ alignItems: "flex-end", maxWidth: 120 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: person.place === "alert" ? colors.coral : colors.ink }}>{person.where}</Text>
              <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2, textTransform: "capitalize" }}>{person.place}</Text>
            </View>
          </View>
        );
        return open ? (
          <Pressable key={person.userId ?? person.phone} onPress={open} style={styles.card}>{body}</Pressable>
        ) : (
          <View key={person.userId ?? person.phone} style={styles.card}>{body}</View>
        );
      })}
    </ScrollView>
    </ScreenShell>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ backgroundColor: active ? colors.ink : colors.paper, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}>
      <Text style={{ color: active ? colors.paper : colors.ink, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}
