import { useCallback, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useFocusEffect, usePathname, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/api";
import { loadSession } from "@/session";
import { colors } from "@/theme";

type Tab = { id: string; label: string; href: Href; glyph: string };

const managerTabs: Tab[] = [
  { id: "home", label: "Home", href: "/overview", glyph: "⌂" },
  { id: "map", label: "Map", href: "/map", glyph: "▣" },
  { id: "team", label: "Team", href: "/team", glyph: "☰" },
  { id: "alerts", label: "Alerts", href: "/alerts", glyph: "●" },
  { id: "me", label: "More", href: "/more", glyph: "···" },
];

const employeeTabs: Tab[] = [
  { id: "home", label: "Home", href: "/check-in", glyph: "⌂" },
  { id: "visits", label: "Visits", href: "/tasks", glyph: "▣" },
  { id: "attend", label: "Attend", href: "/leave", glyph: "☰" },
  { id: "pay", label: "Pay", href: "/payroll", glyph: "₹" },
  { id: "me", label: "More", href: "/more", glyph: "···" },
];

function tabsFor(role: string) {
  return role === "employee" ? employeeTabs : managerTabs;
}

function activeId(pathname: string, role: string) {
  if (pathname.startsWith("/more")) return "me";
  if (role === "employee") {
    if (pathname.startsWith("/check-in")) return "home";
    if (pathname.startsWith("/tasks") || pathname.startsWith("/task")) return "visits";
    if (pathname.startsWith("/leave")) return "attend";
    if (pathname.startsWith("/payroll")) return "pay";
    return "me";
  }
  if (pathname.startsWith("/overview")) return "home";
  if (pathname.startsWith("/map")) return "map";
  if (pathname.startsWith("/team")) return "team";
  if (pathname.startsWith("/alerts")) return "alerts";
  return "me";
}

export function ScreenShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [role, setRole] = useState<string | null>(null);
  const [badge, setBadge] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      loadSession()
        .then(async (session) => {
          if (!session || !live) return;
          setRole(session.user.role);
          if (session.user.role === "employee") {
            setBadge(0);
            return;
          }
          try {
            const body = await api<{ alerts: { status: string }[] }>("/alerts", {}, session.token);
            if (!live) return;
            setBadge(body.alerts.filter((alert) => alert.status === "open" || alert.status === "escalated").length);
          } catch {
            if (live) setBadge(0);
          }
        })
        .catch(() => undefined);
      return () => {
        live = false;
      };
    }, []),
  );

  const tabs = role ? tabsFor(role) : [];
  const active = role ? activeId(pathname, role) : "";

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <View style={{ flex: 1 }}>{children}</View>
      <View
        style={{
          flexDirection: "row",
          backgroundColor: colors.paper,
          borderTopWidth: 1,
          borderTopColor: colors.cream2,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 6),
          paddingHorizontal: 4,
          justifyContent: "space-around",
        }}
      >
        {tabs.map((tab) => {
          const on = tab.id === active;
          return (
            <Pressable
              key={tab.id}
              onPress={() => {
                if (!on) router.replace(tab.href);
              }}
              style={{
                alignItems: "center",
                gap: 3,
                paddingVertical: 4,
                paddingHorizontal: 12,
                borderRadius: 12,
                backgroundColor: on ? colors.greenSoft : "transparent",
                minWidth: 56,
              }}
            >
              <View>
                <Text style={{ fontSize: 16, fontWeight: on ? "700" : "500", color: on ? colors.greenDeep : colors.ink3 }}>
                  {tab.glyph}
                </Text>
                {tab.id === "alerts" && badge > 0 ? (
                  <View
                    style={{
                      position: "absolute",
                      top: -4,
                      right: -10,
                      minWidth: 16,
                      height: 16,
                      borderRadius: 8,
                      backgroundColor: colors.coral,
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 4,
                    }}
                  >
                    <Text style={{ color: colors.paper, fontSize: 9, fontWeight: "700" }}>{badge > 9 ? "9+" : badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={{ fontSize: 10, fontWeight: on ? "600" : "500", color: on ? colors.greenDeep : colors.ink3 }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
