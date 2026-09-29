import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { BrandMark } from "@/brand";
import { homeHref, loadSession, markWelcomed, type Session } from "@/session";
import { colors, styles } from "@/theme";

export default function Welcome() {
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
  const name = session?.user.name?.split(" ")[0];

  return (
    <View style={[styles.screen, { justifyContent: "center" }]}>
      <BrandMark size={56} />
      <Text style={[styles.title, { marginTop: 20 }]}>
        Welcome{name ? `, ${name}` : ""} to your team
      </Text>
      <Text style={styles.sub}>
        {session?.workspace.name || "This company"}
        {session ? ` · ${employee ? "field" : session.user.role}` : ""}
      </Text>
      <Text style={styles.sub}>
        {employee
          ? "Check in with a photo and a GPS fix when you arrive. Tasks, leave, and your days present live on the tabs below."
          : "Overview shows who is on site. Map, team, and alerts are one tap away. Radius, attendance, and visits are under More."}
      </Text>
      <Pressable
        style={styles.button}
        onPress={async () => {
          if (!session) return;
          await markWelcomed(session.user.id);
          router.replace(homeHref(session));
        }}
      >
        <Text style={styles.buttonText}>Continue</Text>
      </Pressable>
    </View>
  );
}
