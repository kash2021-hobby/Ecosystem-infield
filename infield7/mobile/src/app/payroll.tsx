import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Stack, router, useFocusEffect } from "expo-router";
import { api } from "@/api";
import { ScreenShell } from "@/chrome";
import { loadSession } from "@/session";
import { colors, styles } from "@/theme";

type Person = { person: string; phone: string; presentDays: number; late: number; checkins: number };
type Employee = { name: string; phone: string; status: string };
type Report = { from: string; to: string; people: Person[] };

type MonthSlip = {
  key: string;
  start: string;
  end: string;
  current: boolean;
  presentDays: number;
  late: number;
  checkins: number;
  weekdays: number;
  people: Person[];
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function lastDate(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthWindows(today: string) {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const day = Number(today.slice(8, 10));
  return [0, 1, 2, 3].map((offset) => {
    const shifted = shiftMonth(year, month, -offset);
    const start = `${shifted.year}-${pad(shifted.month)}-01`;
    const endDay = offset === 0 ? day : lastDate(shifted.year, shifted.month);
    return {
      key: `${shifted.year}-${pad(shifted.month)}`,
      start,
      end: `${shifted.year}-${pad(shifted.month)}-${pad(endDay)}`,
      current: offset === 0,
    };
  });
}

function monthLabel(day: string) {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function weekdaysBetween(from: string, to: string) {
  let count = 0;
  let day = from;
  while (day <= to) {
    const weekday = new Date(`${day}T00:00:00`).getDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
    const [year, month, date] = day.split("-").map(Number);
    day = new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
  }
  return count;
}

function pickMine(people: Person[], phone: string, role: string): Person {
  return people.find((person) => person.phone === phone) ?? {
    person: role === "employee" ? "You" : "Team",
    phone,
    presentDays: 0,
    late: 0,
    checkins: 0,
  };
}

function totals(people: Person[], phone: string, role: string) {
  if (role === "employee") {
    const mine = pickMine(people, phone, role);
    return { presentDays: mine.presentDays, late: mine.late, checkins: mine.checkins, people: [mine] };
  }
  return {
    presentDays: people.reduce((sum, person) => sum + person.presentDays, 0),
    late: people.reduce((sum, person) => sum + person.late, 0),
    checkins: people.reduce((sum, person) => sum + person.checkins, 0),
    people,
  };
}

export default function Payroll() {
  const [role, setRole] = useState("employee");
  const [phone, setPhone] = useState("");
  const [months, setMonths] = useState<MonthSlip[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const session = await loadSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    setRole(session.user.role);
    setPhone(session.user.phone);
    const today = new Date().toISOString().slice(0, 10);
    const windows = monthWindows(today);
    const employeeList =
      session.user.role === "employee"
        ? { employees: [] as Employee[] }
        : await api<{ employees: Employee[] }>("/employees", {}, session.token);
    const reports = await Promise.all(
      windows.map((window) => api<Report>(`/reports/attendance?from=${window.start}&to=${window.end}`, {}, session.token)),
    );
    const active = employeeList.employees.filter((person) => person.status === "active");
    const slips = windows.map((window, index) => {
      const report = reports[index];
      const byPhone = new Map(report.people.map((person) => [person.phone, person]));
      const people =
        session.user.role !== "employee" && active.length
          ? active.map(
              (person) =>
                byPhone.get(person.phone) ?? {
                  person: person.name,
                  phone: person.phone,
                  presentDays: 0,
                  late: 0,
                  checkins: 0,
                },
            )
          : report.people;
      const counted = totals(people, session.user.phone, session.user.role);
      return {
        ...window,
        presentDays: counted.presentDays,
        late: counted.late,
        checkins: counted.checkins,
        weekdays: weekdaysBetween(window.start, window.end),
        people: counted.people,
      };
    });
    setMonths(slips);
    setSelected((current) => current || slips[0]?.key || "");
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  const slip = useMemo(
    () => months.find((month) => month.key === selected) ?? months[0],
    [months, selected],
  );
  const history = months.filter((month) => month.key !== slip?.key);
  const employee = role === "employee";

  return (
    <ScreenShell>
      <Stack.Screen options={{ title: employee ? "My pay" : "Payroll" }} />
      <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ padding: 20, paddingBottom: 24 }}>
        <Text style={styles.sub}>{slip ? monthLabel(slip.end) : "This month"} · days present from check-in</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {slip ? (
          <View style={{ borderRadius: 20, overflow: "hidden", backgroundColor: colors.paper, marginBottom: 12 }}>
            <View style={{ backgroundColor: colors.ink, padding: 20, paddingBottom: 24 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View>
                  <Text style={{ fontSize: 11, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", color: colors.paper, opacity: 0.6 }}>
                    {employee ? "Days present" : "Days on the books"}
                  </Text>
                  <Text style={{ fontSize: 34, fontWeight: "700", color: colors.paper, letterSpacing: -1, marginTop: 6 }}>
                    {slip.presentDays}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.paper, opacity: 0.7, marginTop: 4 }}>
                    {slip.current ? "So far this month" : `Closed ${monthLabel(slip.end)}`}
                    {` · ${slip.weekdays} weekdays`}
                  </Text>
                </View>
                <View style={{ backgroundColor: colors.greenSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ color: colors.greenDeep, fontSize: 11, fontWeight: "700" }}>Counted</Text>
                </View>
              </View>
              <View
                style={{
                  marginTop: 20,
                  marginBottom: -24,
                  height: 1,
                  borderStyle: "dashed",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.28)",
                }}
              />
            </View>

            <View style={{ padding: 18 }}>
              {(
              [
                { label: "Weekdays in range", value: String(slip.weekdays), warn: false },
                { label: "Days present", value: String(slip.presentDays), warn: false },
                { label: "Check-ins", value: String(slip.checkins), warn: false },
                { label: "Late arrivals", value: String(slip.late), warn: slip.late > 0 },
              ] as const
            ).map((row) => (
                <View
                  key={row.label}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderStyle: "dashed",
                    borderBottomColor: colors.cream2,
                  }}
                >
                  <Text style={{ fontSize: 13, color: colors.ink3 }}>{row.label}</Text>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: row.warn ? colors.coral : colors.ink }}>{row.value}</Text>
                </View>
              ))}
              <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.ink }}>Total days</Text>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.ink }}>{slip.presentDays}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {slip ? (
          <View style={styles.card}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink, marginBottom: 12 }}>How this was calculated</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Mini label="Days" value={String(slip.presentDays)} hint={`of ${slip.weekdays} weekdays`} />
              <Mini label="Check-ins" value={String(slip.checkins)} hint={employee ? "this month" : "all people"} />
              <Mini label="Late" value={String(slip.late)} hint="times" />
            </View>
          </View>
        ) : null}

        {!employee && slip ? (
          <View style={styles.card}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink, marginBottom: 4 }}>By person</Text>
            <Text style={[styles.sub, { marginBottom: 8 }]}>Present days. Rupee amounts stay off this screen until a salary rate exists.</Text>
            {slip.people.map((person) => (
              <View key={person.phone} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.cream2 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.cream2, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontWeight: "700", color: colors.ink }}>{person.person.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.ink }}>{person.person}</Text>
                  <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
                    {person.presentDays} day{person.presentDays === 1 ? "" : "s"} · {person.checkins} check-in{person.checkins === 1 ? "" : "s"}
                    {person.late ? ` · ${person.late} late` : ""}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <View style={[styles.card, { padding: 0, overflow: "hidden" }]}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>History</Text>
          {history.length === 0 ? (
            <Text style={[styles.sub, { paddingHorizontal: 16, paddingBottom: 14 }]}>Earlier months will show here after check-ins land.</Text>
          ) : null}
          {history.map((month) => (
            <Pressable
              key={month.key}
              onPress={() => setSelected(month.key)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderTopWidth: 1,
                borderTopColor: colors.cream2,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "500", color: colors.ink }}>{monthLabel(month.end)}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.ink }}>{month.presentDays} days</Text>
                <View style={{ backgroundColor: colors.greenSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: colors.greenDeep, fontSize: 11, fontWeight: "700" }}>Counted</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

function Mini({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: colors.cream }}>
      <Text style={{ fontSize: 10, color: colors.ink3, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase" }}>{label}</Text>
      <Text style={{ fontSize: 18, fontWeight: "700", color: colors.ink, marginTop: 4 }}>{value}</Text>
      <Text style={{ fontSize: 10, color: colors.ink3, marginTop: 2 }}>{hint}</Text>
    </View>
  );
}
