import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, type Href } from "expo-router";
import { ScreenShell } from "@/chrome";
import { leaveSession, loadSession, type Session } from "@/session";
import { colors, styles } from "@/theme";

type Link = { label: string; hint: string; href: Href };

const managerLinks: Link[] = [
  { label: "AI copilot", hint: "This week's cited brief", href: "/copilot" },
  { label: "Weekly brief", hint: "Last seven days in one story", href: "/copilot/briefing" },
  { label: "Work radius", hint: "Site fence, 30 m to 5 km", href: "/geofence" },
  { label: "Attendance", hint: "This week's check-ins", href: "/attendance" },
  { label: "Today's visits", hint: "Who checked in where", href: "/field" },
  { label: "Payroll", hint: "Present days this month", href: "/payroll" },
  { label: "Tasks", hint: "Open work and photos", href: "/tasks" },
  { label: "Check in", hint: "Clock in from this phone", href: "/check-in" },
  { label: "Leave", hint: "Approve days away", href: "/leave" },
];

const employeeLinks: Link[] = [
  { label: "My tasks", hint: "Today, upcoming, done", href: "/tasks" },
  { label: "Leave", hint: "Ask for days away", href: "/leave" },
  { label: "My days", hint: "Present days this month", href: "/payroll" },
];

export default function More() {
  const [session, setSession] = useState<Session | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadSession().then((current) => {
        if (!current) {
          router.replace("/login");
          return;
        }
        setSession(current);
      });
    }, []),
  );

  const employee = session?.user.role === "employee";
  const links = employee ? employeeLinks : managerLinks;

  return (
    <ScreenShell>
      <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ padding: 20, paddingBottom: 24 }}>
        <Text style={styles.title}>{session?.user.name || session?.user.phone || "More"}</Text>
        <Text style={styles.sub}>
          {session?.workspace.name || "InField 7"}
          {session ? ` · ${employee ? "field" : session.user.role}` : ""}
        </Text>
        {links.map((link) => (
          <Pressable key={String(link.href)} onPress={() => router.push(link.href)} style={styles.card}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.ink }}>{link.label}</Text>
            <Text style={[styles.sub, { marginBottom: 0, marginTop: 4 }]}>{link.hint}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={async () => {
            await leaveSession();
            router.replace("/login");
          }}
          style={[styles.button, styles.secondary, { marginTop: 8 }]}
        >
          <Text style={[styles.buttonText, styles.secondaryText]}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </ScreenShell>
  );
}
