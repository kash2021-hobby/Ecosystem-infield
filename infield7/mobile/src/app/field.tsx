import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { WebView } from "react-native-webview";
import { api } from "@/api";
import { ScreenShell } from "@/chrome";
import { visitsHtml } from "@/mapHtml";
import { loadSession } from "@/session";
import { colors, styles } from "@/theme";

type Employee = { userId: string | null; name: string; phone: string; status: string };
type Checkin = {
  id: string;
  user_id: string;
  person: string;
  phone: string;
  site: string | null;
  lat: number;
  lng: number;
  late: boolean;
  checked_in_at: string;
};
type Person = { userId: string; site: string | null };

function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export default function FieldDay() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [presence, setPresence] = useState<Person[]>([]);
  const [personId, setPersonId] = useState<string | null>(null);
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
    const [roster, attendance, live] = await Promise.all([
      api<{ employees: Employee[] }>("/employees", {}, session.token),
      api<{ checkins: Checkin[] }>("/attendance", {}, session.token),
      api<{ people: Person[] }>("/presence", {}, session.token),
    ]);
    const active = roster.employees.filter((person) => person.status === "active" && person.userId);
    setEmployees(active);
    setCheckins(attendance.checkins);
    setPresence(live.people);
    setPersonId((current) => {
      if (current && active.some((person) => person.userId === current)) return current;
      const withVisit = attendance.checkins[0]?.user_id;
      return withVisit ?? active[0]?.userId ?? null;
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  const person = employees.find((item) => item.userId === personId);
  const visits = useMemo(
    () =>
      checkins
        .filter((row) => row.user_id === personId)
        .sort((a, b) => a.checked_in_at.localeCompare(b.checked_in_at)),
    [checkins, personId],
  );
  const live = presence.find((item) => item.userId === personId);
  const km = visits.reduce((sum, row, index) => {
    if (index === 0) return 0;
    return sum + kmBetween(visits[index - 1], row);
  }, 0);
  const sites = new Set(visits.map((row) => row.site).filter(Boolean)).size;
  const html = visitsHtml(visits.map((row, index) => ({ lat: row.lat, lng: row.lng, label: String(index + 1) })));

  return (
    <ScreenShell>
    <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
        <Text style={styles.sub}>{person ? `${person.name} · today` : "Pick someone who checked in"}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginBottom: 12 }}>
          {employees.map((item) => (
            <Pressable
              key={item.userId}
              onPress={() => setPersonId(item.userId)}
              style={{ backgroundColor: item.userId === personId ? colors.ink : colors.paper, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
            >
              <Text style={{ color: item.userId === personId ? colors.paper : colors.ink, fontWeight: "600", fontSize: 13 }}>{item.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={{ marginHorizontal: 16, height: 220, borderRadius: 20, overflow: "hidden", backgroundColor: colors.cream2 }}>
        {visits.length ? <WebView originWhitelist={["*"]} source={{ html }} /> : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20 }}>
            <Text style={[styles.sub, { marginBottom: 0, textAlign: "center" }]}>No check-ins for this person today, so there is no route yet.</Text>
          </View>
        )}
      </View>

      <View style={{ padding: 16, gap: 8, flexDirection: "row", flexWrap: "wrap" }}>
        <Stat label="Visits" value={String(visits.length)} hint={sites ? `${sites} site${sites === 1 ? "" : "s"}` : "none yet"} />
        <Stat label="On site" value={live?.site ? "Yes" : visits.length ? "Field" : "—"} hint={live?.site ?? "from last position"} />
        <Stat label="Distance" value={visits.length > 1 ? `${km.toFixed(1)} km` : "—"} hint="between check-ins" />
        <Stat label="Late" value={String(visits.filter((row) => row.late).length)} hint="today" />
      </View>

      <View style={{ paddingHorizontal: 16 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink, marginBottom: 10 }}>Today's visits</Text>
        <View style={styles.card}>
          {visits.length === 0 ? <Text style={[styles.sub, { marginBottom: 0 }]}>This person has not checked in today.</Text> : null}
          {visits.map((row, index) => (
            <View key={row.id} style={{ flexDirection: "row", gap: 12, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.cream2 }}>
              <Text style={{ width: 48, fontSize: 12, fontWeight: "600", color: colors.ink3, paddingTop: 2 }}>
                {new Date(row.checked_in_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.ink }}>{row.site ?? "Field"}</Text>
                <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>{row.late ? "Late check-in" : "On time"}</Text>
              </View>
              <View style={{ backgroundColor: colors.greenSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start" }}>
                <Text style={{ color: colors.greenDeep, fontSize: 11, fontWeight: "700" }}>Complete</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
    </ScreenShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={{ width: "48%", backgroundColor: colors.paper, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.cream2 }}>
      <Text style={{ fontSize: 10, color: colors.ink3, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }}>{label}</Text>
      <Text style={{ fontSize: 22, fontWeight: "700", color: colors.ink, marginTop: 6 }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>{hint}</Text>
    </View>
  );
}
