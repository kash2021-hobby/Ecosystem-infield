import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Redirect, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { api } from "@/api";
import { BrandWordmark, RadarHero } from "@/brand";
import { homeHref, loadPending, loadSession, savePending } from "@/session";
import { colors, styles } from "@/theme";

export default function Login() {
  const params = useLocalSearchParams<{ code?: string }>();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [home, setHome] = useState<"/check-in" | "/overview">("/overview");
  const [country, setCountry] = useState("+91");
  const [phone, setPhone] = useState("");
  const [invite, setInvite] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setReady(false);
      Promise.all([loadSession(), loadPending()]).then(([session, pending]) => {
        if (session) {
          setHome(homeHref(session));
          setSignedIn(true);
          return;
        }
        setSignedIn(false);
        if (pending?.phone) setPhone(pending.phone);
        if (pending?.country) setCountry(pending.country);
        const code = typeof params.code === "string" ? params.code : pending?.invite;
        if (code) setInvite(code);
      }).finally(() => setReady(true));
    }, [params.code]),
  );

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ devCode?: string }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ phone, country_code: country }),
      });
      await savePending({ phone, country, devCode: result.devCode, invite: invite.trim() || undefined });
      router.push("/verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the code");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.cream }} />;
  if (signedIn) return <Redirect href={home} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.cream }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <View style={{ paddingTop: 28, paddingHorizontal: 24, paddingBottom: 28, alignItems: "center", backgroundColor: colors.greenSoft }}>
          <BrandWordmark />
          <RadarHero />
          <Text style={{ fontSize: 26, fontWeight: "700", color: colors.ink, letterSpacing: -0.6, textAlign: "center", lineHeight: 30 }}>
            Your team, everywhere,{"\n"}at a glance.
          </Text>
          <Text style={{ fontSize: 14, color: colors.ink3, marginTop: 10, textAlign: "center", lineHeight: 20, maxWidth: 300 }}>
            Track attendance, field visits, and payroll from one dashboard.
          </Text>
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: -16 }}>
          <View style={[styles.card, { padding: 20 }]}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink, marginBottom: 14 }}>Sign in to continue</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={[styles.row, { marginBottom: 10 }]}>
              <TextInput
                style={[styles.input, { width: 72, marginBottom: 0, backgroundColor: colors.cream }]}
                value={country}
                onChangeText={setCountry}
                keyboardType="phone-pad"
              />
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0, backgroundColor: colors.cream }]}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="98765 43210"
                placeholderTextColor={colors.ink3}
                autoComplete="tel"
              />
            </View>
            {invite ? (
              <Text style={[styles.sub, { marginBottom: 10 }]}>Invite {invite} will attach you to that company after the code.</Text>
            ) : null}
            <Pressable style={[styles.button, { marginTop: 4, borderRadius: 14 }]} disabled={busy || phone.trim().length < 8} onPress={submit}>
              <Text style={styles.buttonText}>{busy ? "Sending" : "Send OTP"}</Text>
            </Pressable>
          </View>
          <Text style={{ textAlign: "center", fontSize: 11, color: colors.ink3, marginTop: 16, lineHeight: 16 }}>
            By continuing you agree that this phone number is how InField identifies you at this company.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
