import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect } from "expo-router";
import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { api, ApiError } from "@/api";
import { ScreenShell } from "@/chrome";
import { loadSession, type Session } from "@/session";
import { colors, styles } from "@/theme";

const OUTBOX = "if7-checkin-outbox";

type Queued = { clientId: string; lat: number; lng: number; accuracyM: number; selfieBase64?: string; mocked?: boolean };

async function readOutbox(): Promise<Queued[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(OUTBOX)) ?? "[]") as Queued[];
  } catch {
    return [];
  }
}

async function readPosition() {
  const lastKnown = Location.getLastKnownPositionAsync({ maxAge: 20_000, requiredAccuracy: 80 });
  const fresh = Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
    mayShowUserSettingsDialog: true,
  });
  try {
    return await Promise.race([
      fresh,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("gps-timeout")), 8_000);
      }),
    ]);
  } catch {
    const known = await lastKnown;
    if (known) return known;
    throw new Error("Could not get a GPS fix. Step outside and try again.");
  }
}

export default function CheckIn() {
  const [session, setSession] = useState<Session | null>(null);
  const [granted, setGranted] = useState<boolean | null>(null);
  const [selfie, setSelfie] = useState<string | undefined>();
  const [queued, setQueued] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const current = await loadSession();
    if (!current) {
      router.replace("/login");
      return;
    }
    setSession(current);
    setQueued((await readOutbox()).length);
    const body = await api<{ granted: boolean }>("/consent", {}, current.token);
    setGranted(body.granted);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  async function allow() {
    if (!session) return;
    setError("");
    await api("/consent", { method: "POST", body: "{}" }, session.token);
    setGranted(true);
  }

  async function takePhoto() {
    setError("");
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Camera permission is required for the check-in photo.");
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.4 });
    if (shot.canceled || !shot.assets[0]?.base64) return;
    setSelfie(`data:image/jpeg;base64,${shot.assets[0].base64}`);
    setMessage("Photo ready.");
  }

  async function flush(current: Session) {
    const items = await readOutbox();
    const left: Queued[] = [];
    for (const item of items) {
      try {
        await api("/check-ins", { method: "POST", body: JSON.stringify(item) }, current.token);
      } catch (err) {
        if (err instanceof ApiError && err.offline) left.push(item);
      }
    }
    await AsyncStorage.setItem(OUTBOX, JSON.stringify(left));
    setQueued(left.length);
    return items.length - left.length;
  }

  async function checkIn() {
    if (!session) return;
    if (!selfie) {
      setError("Take a check-in photo first.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError("Location permission is required to check in.");
        return;
      }
      const position = await readPosition();
      const accuracy = position.coords.accuracy ?? 0;
      if (accuracy <= 0) {
        setError("The location fix was not sharp enough.");
        return;
      }
      const payload: Queued = {
        clientId: Crypto.randomUUID(),
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracyM: accuracy,
        selfieBase64: selfie,
        mocked: position.mocked === true,
      };
      try {
        const result = await api<{ site?: string; late?: boolean; replayed?: boolean }>(
          "/check-ins",
          { method: "POST", body: JSON.stringify(payload) },
          session.token,
        );
        const sent = await flush(session);
        const late = result.late ? " Marked late." : "";
        const saved = sent ? ` Sent ${sent} saved check-in${sent === 1 ? "" : "s"}.` : "";
        setMessage(result.replayed ? "Already recorded." : `Checked in at ${result.site ?? "the site"}.${late}${saved}`);
        setSelfie(undefined);
      } catch (err) {
        if (err instanceof ApiError && err.offline) {
          const next = [...(await readOutbox()), payload];
          await AsyncStorage.setItem(OUTBOX, JSON.stringify(next));
          setQueued(next.length);
          setMessage("Saved on this phone. It will send when the connection returns.");
        } else {
          throw err;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function sos() {
    if (!session) return;
    setError("");
    try {
      await api("/sos", { method: "POST", body: "{}" }, session.token);
      setMessage("SOS sent to your manager.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send SOS");
    }
  }

  if (granted === false) {
    return (
      <ScreenShell>
      <View style={styles.screen}>
        <Text style={styles.title}>Location for check-in</Text>
        <Text style={styles.sub}>
          InField uses your location to confirm you are inside a site. It is stored with your attendance for this company. You can refuse, and then check-in stays unavailable.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.button} onPress={allow}>
          <Text style={styles.buttonText}>I agree</Text>
        </Pressable>
      </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
    <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ padding: 20, paddingBottom: 24 }}>
      <Text style={styles.title}>{session?.workspace.name || "Check in"}</Text>
      <Text style={styles.sub}>A photo, a GPS fix, and a point inside a site. Take the photo first, then check in.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.notice}>{message}</Text> : null}
      {queued > 0 ? <Text style={styles.sub}>{queued} check-in waiting to send.</Text> : null}
      <Pressable style={[styles.button, styles.secondary]} onPress={takePhoto}>
        <Text style={[styles.buttonText, styles.secondaryText]}>{selfie ? "Photo added" : "Take check-in photo"}</Text>
      </Pressable>
      <Pressable style={styles.button} disabled={busy || granted !== true} onPress={checkIn}>
        <Text style={styles.buttonText}>{busy ? "Checking" : "Check in now"}</Text>
      </Pressable>
      <Pressable style={[styles.button, styles.secondary]} onPress={sos}>
        <Text style={[styles.buttonText, styles.secondaryText]}>Send SOS</Text>
      </Pressable>
    </ScrollView>
    </ScreenShell>
  );
}
