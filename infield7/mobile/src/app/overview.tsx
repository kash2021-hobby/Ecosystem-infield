import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { api } from "@/api";
import { ScreenShell } from "@/chrome";
import { loadSession, type Session } from "@/session";
import { colors, styles } from "@/theme";

type Person = { userId: string; person: string; site: string | null };
type Checkin = { person: string; phone: string; site: string | null; late: boolean };
type Site = { id: string; name: string };
type Employee = { userId: string | null; status: string };
type Alert = { status: string };

export default function Overview() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [onSite, setOnSite] = useState(0);
  const [field, setField] = useState(0);
  const [offline, setOffline] = useState(0);
  const [openAlerts, setOpenAlerts] = useState(0);
  const [present, setPresent] = useState(0);
  const [late, setLate] = useState(0);
  const [absent, setAbsent] = useState(0);
  const [sites, setSites] = useState<{ name: string; people: number; late: number }[]>([]);

  const refresh = useCallback(async () => {
    const current = await loadSession();
    if (!current) {
      router.replace("/login");
      return;
    }
    if (current.user.role === "employee") {
      router.replace("/check-in");
      return;
    }
    setSession(current);
    const [presence, attendance, alerts, roster, siteList] = await Promise.all([
      api<{ people: Person[] }>("/presence", {}, current.token),
      api<{ checkins: Checkin[] }>("/attendance", {}, current.token),
      api<{ alerts: Alert[] }>("/alerts", {}, current.token),
      api<{ employees: Employee[] }>("/employees", {}, current.token),
      api<{ sites: Site[] }>("/sites", {}, current.token),
    ]);
    const seen = new Set(presence.people.map((person) => person.userId));
    const active = roster.employees.filter((person) => person.status === "active" && person.userId);
    setOnSite(presence.people.filter((person) => person.site).length);
    setField(presence.people.filter((person) => !person.site).length);
    setOffline(active.filter((person) => person.userId && !seen.has(person.userId)).length);
    setOpenAlerts(alerts.alerts.filter((alert) => alert.status === "open" || alert.status === "escalated").length);
    const checkedIn = new Set(attendance.checkins.map((row) => row.phone));
    const latePhones = new Set(attendance.checkins.filter((row) => row.late).map((row) => row.phone));
    setPresent(checkedIn.size - latePhones.size);
    setLate(latePhones.size);
    setAbsent(Math.max(active.length - checkedIn.size, 0));
    setSites(siteList.sites.map((site) => ({
      name: site.name,
      people: presence.people.filter((person) => person.site === site.name).length,
      late: attendance.checkins.filter((row) => row.late && row.site === site.name).length,
    })));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  const total = present + late + absent;
  const presentFlex = total ? present : 0;
  const lateFlex = total ? late : 0;
  const absentFlex = total ? absent : 1;

  return (
    <ScreenShell>
    <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ padding: 20, paddingBottom: 24 }}>
      <Text style={styles.title}>{session?.workspace.name || "Overview"}</Text>
      <Text style={styles.sub}>{sites.length} site{sites.length === 1 ? "" : "s"}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={{ borderRadius: 20, overflow: "hidden", backgroundColor: colors.paper, marginBottom: 12 }}>
        <View style={{ backgroundColor: colors.ink, padding: 18 }}>
          <Text style={{ color: colors.paper, opacity: 0.7, fontSize: 11, fontWeight: "600", letterSpacing: 1 }}>LIVE</Text>
          <View style={{ flexDirection: "row", marginTop: 14 }}>
            <Count value={onSite} label="On-site" color={colors.green} />
            <Count value={field} label="Field" color={colors.amber} />
            <Count value={offline} label="Offline" color="#B7BCC4" />
          </View>
        </View>
        <Pressable onPress={() => router.push("/alerts")} style={{ flexDirection: "row", gap: 8, padding: 14, alignItems: "center" }}>
          <Chip label={`${openAlerts} alert${openAlerts === 1 ? "" : "s"}`} color={colors.coral} background={colors.coralSoft} />
          <Chip label={`${late} late`} color="#8A5A10" background="#F8EFD6" />
        </Pressable>
        <Pressable onPress={() => router.push("/copilot")} style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.ink }}>Open AI copilot →</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontWeight: "700", color: colors.ink }}>Attendance today</Text>
          <Text style={{ color: colors.ink3, fontSize: 12 }}>{present + late} checked in</Text>
        </View>
        <View style={{ flexDirection: "row", height: 12, borderRadius: 999, overflow: "hidden", marginTop: 12, backgroundColor: colors.cream2 }}>
          <View style={{ flex: presentFlex, backgroundColor: colors.green }} />
          <View style={{ flex: lateFlex, backgroundColor: colors.amber }} />
          <View style={{ flex: absentFlex, backgroundColor: colors.ink4 }} />
        </View>
        <Text style={[styles.sub, { marginTop: 12, marginBottom: 0 }]}>
          Present {present} · Late {late} · Absent {absent}
        </Text>
      </View>

      <Text style={{ fontWeight: "700", color: colors.ink, marginBottom: 8 }}>Sites</Text>
      {sites.length === 0 ? <Text style={styles.sub}>No sites yet. Add them on the website.</Text> : null}
      {sites.map((site) => (
        <View key={site.name} style={styles.card}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.ink, flex: 1 }}>{site.name}</Text>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.ink }}>{site.people}</Text>
          </View>
          <Text style={[styles.sub, { marginBottom: 0, marginTop: 4 }]}>
            {site.people === 1 ? "1 on site" : `${site.people} on site`}
            {site.late ? ` · ${site.late} late` : ""}
          </Text>
        </View>
      ))}

    </ScrollView>
    </ScreenShell>
  );
}

function Count({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 32, fontWeight: "700", color, letterSpacing: -1 }}>{value}</Text>
      <Text style={{ color: colors.paper, opacity: 0.7, fontSize: 11, marginTop: 4 }}>{label}</Text>
    </View>
  );
}

function Chip({ label, color, background }: { label: string; color: string; background: string }) {
  return (
    <View style={{ backgroundColor: background, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

