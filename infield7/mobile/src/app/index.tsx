import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { BrandMark } from "@/brand";
import { homeHref, loadSession, type Session } from "@/session";
import { colors } from "@/theme";

export default function BrandCover() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const going = useRef(false);
  const skipWait = useRef(false);

  useEffect(() => {
    loadSession().then(setSession).catch(() => setSession(null));
  }, []);

  const advance = useCallback(() => {
    if (going.current || session === undefined) {
      skipWait.current = true;
      return;
    }
    going.current = true;
    router.replace(session ? homeHref(session) : "/login");
  }, [session]);

  useEffect(() => {
    if (session === undefined) return;
    if (skipWait.current) {
      advance();
      return;
    }
    const timer = setTimeout(advance, 1200);
    return () => clearTimeout(timer);
  }, [advance, session]);

  return (
    <Pressable
      onPress={advance}
      style={{ flex: 1, backgroundColor: colors.cream, alignItems: "center", justifyContent: "center", padding: 32 }}
    >
      <BrandMark size={64} />
      <Text style={{ fontSize: 28, fontWeight: "700", color: colors.ink, letterSpacing: -0.6, marginTop: 18 }}>InField 7</Text>
      <Text style={{ fontSize: 15, color: colors.ink3, marginTop: 8, textAlign: "center" }}>Your team, everywhere, at a glance.</Text>
    </Pressable>
  );
}
