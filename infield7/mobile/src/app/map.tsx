import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { api } from "@/api";
import { ScreenShell } from "@/chrome";
import { mapHtml, type MapPerson, type MapSite } from "@/mapHtml";
import { loadSession } from "@/session";
import { colors, styles } from "@/theme";

export default function LiveMap() {
  const web = useRef<WebView>(null);
  const [people, setPeople] = useState<MapPerson[]>([]);
  const [sites, setSites] = useState<MapSite[]>([]);
  const [seen, setSeen] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const params = useLocalSearchParams<{ userId?: string }>();
  const focusId = typeof params.userId === "string" ? params.userId : null;

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
    const body = await api<{ people: (MapPerson & { recordedAt: string })[]; sites: MapSite[] }>("/presence", {}, session.token);
    setPeople(body.people.map(({ recordedAt: _recordedAt, ...person }) => person));
    setSeen(Object.fromEntries(body.people.map((person) => [person.userId, person.recordedAt])));
    setSites(body.sites);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  useEffect(() => {
    if (focusId && people.some((person) => person.userId === focusId)) setSelectedId(focusId);
  }, [focusId, people]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return people;
    return people.filter((person) => person.person.toLowerCase().includes(needle) || (person.site ?? "").toLowerCase().includes(needle));
  }, [people, query]);

  const onSite = shown.filter((person) => person.site).length;
  const field = shown.length - onSite;
  const selected = people.find((person) => person.userId === selectedId) ?? null;
  const html = useMemo(() => mapHtml(shown, sites), [shown, sites]);

  function choose(userId: string) {
    setSelectedId(userId);
    web.current?.injectJavaScript(`window.focusPerson && window.focusPerson(${JSON.stringify(userId)}); true;`);
  }

  return (
    <ScreenShell>
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <View style={{ flex: 1 }}>
        <WebView
          ref={web}
          originWhitelist={["*"]}
          source={{ html }}
          onMessage={(event: WebViewMessageEvent) => setSelectedId(event.nativeEvent.data)}
          onLoadEnd={() => {
            if (selectedId) web.current?.injectJavaScript(`window.focusPerson && window.focusPerson(${JSON.stringify(selectedId)}); true;`);
          }}
          style={{ flex: 1, backgroundColor: colors.cream2 }}
        />
        <View style={{ position: "absolute", top: 12, left: 12, right: 12 }} pointerEvents="box-none">
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search people or sites"
            placeholderTextColor={colors.ink3}
            style={[styles.input, { backgroundColor: colors.paper, marginBottom: 8 }]}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Legend label={`On-site ${onSite}`} background={colors.greenSoft} color={colors.greenDeep} />
            <Legend label={`Field ${field}`} background="#F8EFD6" color="#8A5A10" />
          </View>
        </View>
      </View>
      {error ? <Text style={[styles.error, { margin: 12 }]}>{error}</Text> : null}
      <View style={{ backgroundColor: colors.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16 }}>
        {selected ? (
          <View>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.ink }}>{selected.person}</Text>
            <Text style={[styles.sub, { marginTop: 4, marginBottom: 0 }]}>
              {selected.site ? `On-site · ${selected.site}` : "Field"}
              {seen[selected.userId] ? ` · seen ${new Date(seen[selected.userId]).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}
            </Text>
          </View>
        ) : (
          <Text style={[styles.sub, { marginBottom: 8 }]}>
            {people.length === 0 ? "Nobody has checked in yet." : "Tap a pin to see who is there. Green rings are site fences."}
          </Text>
        )}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {shown.map((person) => (
            <Pressable key={person.userId} onPress={() => choose(person.userId)} style={{ backgroundColor: person.userId === selectedId ? colors.ink : colors.cream, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ color: person.userId === selectedId ? colors.paper : colors.ink, fontWeight: "600", fontSize: 13 }}>{person.person}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
    </ScreenShell>
  );
}

function Legend({ label, background, color }: { label: string; background: string; color: string }) {
  return (
    <View style={{ backgroundColor: background, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}
