import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { WebView } from "react-native-webview";
import { api } from "@/api";
import { ScreenShell } from "@/chrome";
import { fenceHtml, type MapSite } from "@/mapHtml";
import { loadSession, type Session } from "@/session";
import { colors, styles } from "@/theme";

const minRadius = 30;
const maxRadius = 5000;
const marks = [100, 500, 1000, 2000, 5000];

export default function WorkRadius() {
  const web = useRef<WebView>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [sites, setSites] = useState<MapSite[]>([]);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

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
    const body = await api<{ sites: MapSite[] }>("/sites", {}, current.token);
    setSites(body.sites);
    setSiteId((currentId) => currentId ?? body.sites[0]?.id ?? null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  const site = sites.find((item) => item.id === siteId) ?? sites[0];
  const radius = draft ?? site?.radiusM ?? 150;

  useEffect(() => {
    web.current?.injectJavaScript(`window.setRadius && window.setRadius(${radius}); true;`);
  }, [radius, site?.id]);

  async function save() {
    if (!session || !site) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api(`/sites/${site.id}`, { method: "PATCH", body: JSON.stringify({ radiusM: radius }) }, session.token);
      setDraft(null);
      setNotice(`Fence saved at ${radius} m. Check-in uses this radius now.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenShell>
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <View style={{ height: 280, backgroundColor: colors.cream2 }}>
        {site ? (
          <WebView
            ref={web}
            key={site.id}
            originWhitelist={["*"]}
            source={{ html: fenceHtml(site) }}
            onLoadEnd={() => web.current?.injectJavaScript(`window.setRadius && window.setRadius(${radius}); true;`)}
          />
        ) : null}
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {sites.length === 0 ? <Text style={styles.sub}>Add a site on the website, then set its radius here.</Text> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginBottom: 16 }}>
          {sites.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => {
                setSiteId(item.id);
                setDraft(null);
                setNotice("");
              }}
              style={{ backgroundColor: item.id === site?.id ? colors.ink : colors.paper, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
            >
              <Text style={{ color: item.id === site?.id ? colors.paper : colors.ink, fontWeight: "600", fontSize: 13 }}>{item.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {site ? (
          <>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.ink }}>{site.name}</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink }}>Radius</Text>
              <Text style={{ fontSize: 28, fontWeight: "700", color: colors.ink }}>{radius} m</Text>
            </View>
            <RadiusSlider value={radius} onChange={(next) => { setDraft(next); setNotice(""); }} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
              {marks.map((mark) => (
                <Pressable key={mark} onPress={() => { setDraft(mark); setNotice(""); }}>
                  <Text style={{ fontSize: 11, color: colors.ink3 }}>{mark >= 1000 ? `${mark / 1000} km` : `${mark} m`}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.sub, { marginTop: 16 }]}>
              A check-in counts inside this circle when the GPS fix is within 80 m. The smallest fence is 30 m and the largest is 5 km.
            </Text>
            <Pressable onPress={save} disabled={saving} style={styles.button}>
              <Text style={styles.buttonText}>{saving ? "Saving…" : "Save geofence"}</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </View>
    </ScreenShell>
  );
}

function RadiusSlider({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  const [width, setWidth] = useState(1);
  const ratio = (value - minRadius) / (maxRadius - minRadius);

  function fromX(x: number) {
    const nextRatio = Math.min(1, Math.max(0, x / width));
    const raw = minRadius + nextRatio * (maxRadius - minRadius);
    const stepped = Math.round(raw / 10) * 10;
    onChange(Math.min(maxRadius, Math.max(minRadius, stepped)));
  }

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(event) => fromX(event.nativeEvent.locationX)}
      onResponderMove={(event) => fromX(event.nativeEvent.locationX)}
      style={{ height: 36, justifyContent: "center", marginTop: 8 }}
    >
      <View style={{ height: 4, borderRadius: 999, backgroundColor: colors.cream2 }} />
      <View style={{ position: "absolute", left: 0, width: Math.max(ratio * width, 0), height: 4, borderRadius: 999, backgroundColor: colors.green }} />
      <View style={{ position: "absolute", left: Math.min(Math.max(ratio * width - 10, 0), width - 20), width: 20, height: 20, borderRadius: 10, backgroundColor: colors.paper, borderWidth: 3, borderColor: colors.green }} />
    </View>
  );
}
