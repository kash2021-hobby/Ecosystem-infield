import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { api } from "@/api";
import { homeHref, loadPending, needsWelcome, savePending, saveSession, type Session } from "@/session";
import { colors, styles } from "@/theme";

export default function Verify() {
  const [code, setCode] = useState("");
  const [invite, setInvite] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("+91");
  const [devCode, setDevCode] = useState("");
  const [wait, setWait] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadPending().then((pending) => {
      if (!pending) return;
      setPhone(pending.phone);
      setCountry(pending.country);
      setDevCode(pending.devCode ?? "");
      if (pending.devCode) setCode(pending.devCode);
      if (pending.invite) setInvite(pending.invite);
    });
  }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function resend() {
    if (wait > 0 || !phone) return;
    setError("");
    try {
      const result = await api<{ devCode?: string }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ phone, country_code: country }),
      });
      await savePending({ phone, country, devCode: result.devCode, invite: invite.trim() || undefined });
      setDevCode(result.devCode ?? "");
      if (result.devCode) setCode(result.devCode);
      setWait(30);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend");
    }
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const session = await api<Session>("/auth/verify", {
        method: "POST",
        body: JSON.stringify({
          phone,
          country_code: country,
          code,
          invite_code: invite.trim() || undefined,
        }),
      });
      await saveSession(session);
      if (await needsWelcome(session.user.id)) router.replace("/welcome");
      else router.replace(homeHref(session));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Enter the code</Text>
      <Text style={styles.sub}>Sent to {country} {phone || "your phone"}.</Text>
      {devCode ? <Text style={styles.notice}>Development code {devCode}. No SMS was sent.</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.label}>6-digit code</Text>
      <TextInput
        style={styles.input}
        value={code}
        onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        placeholder="000000"
        placeholderTextColor={colors.ink3}
      />
      <Text style={styles.label}>Invite code</Text>
      <TextInput
        style={styles.input}
        value={invite}
        onChangeText={setInvite}
        autoCapitalize="characters"
        placeholder="Only if a manager sent one"
        placeholderTextColor={colors.ink3}
      />
      <Pressable style={styles.button} disabled={busy || code.length !== 6} onPress={submit}>
        <Text style={styles.buttonText}>{busy ? "Checking" : "Sign in"}</Text>
      </Pressable>
      <Pressable style={[styles.button, styles.secondary]} disabled={wait > 0 || !phone} onPress={resend}>
        <Text style={[styles.buttonText, styles.secondaryText]}>{wait > 0 ? `Resend in ${wait}s` : "Resend code"}</Text>
      </Pressable>
    </View>
  );
}
