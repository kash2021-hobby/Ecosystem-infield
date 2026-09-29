import { useCallback, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/api";
import { loadSession, type Session } from "@/session";
import { colors, styles } from "@/theme";
import type { TaskDetail } from "@/taskDetail";

export default function StepUpdate() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const current = await loadSession();
        if (!current || !id) return;
        setSession(current);
        setTask(await api<TaskDetail>(`/tasks/${id}`, {}, current.token));
      })().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [id]),
  );

  async function takePhoto() {
    setError("");
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Camera permission is required.");
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.4 });
    if (shot.canceled || !shot.assets[0]?.base64) return;
    setPhoto(`data:image/jpeg;base64,${shot.assets[0].base64}`);
  }

  async function submit() {
    if (!session || !id) return;
    if (!photo) {
      setError("Take a photo of the finished work.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/tasks/${id}`, {
        method: "POST",
        body: JSON.stringify({ status: "done", note: note || undefined, photoBase64: photo }),
      }, session.token);
      router.replace(`/task/${id}/next`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  const steps = task?.steps.length ? task.steps : task ? [{ id: task.id, title: task.title, status: task.status, n: 1 }] : [];
  const current = steps.find((step) => step.id === id) ?? steps.find((step) => step.status !== "done");
  const total = steps.length || 1;
  const n = current?.n ?? 1;

  return (
    <View style={{ flex: 1, backgroundColor: "rgba(28,36,48,0.45)", justifyContent: "flex-end" }}>
      <View style={{ backgroundColor: colors.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28 }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.cream2, alignSelf: "center", marginBottom: 14 }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: colors.paper, fontWeight: "700", fontSize: 12 }}>{n}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.ink }}>{current?.title ?? task?.title ?? "Step"}</Text>
            <Text style={{ fontSize: 12, color: colors.ink3 }}>Step {n} of {total}</Text>
          </View>
        </View>
        {error ? <Text style={[styles.error, { marginTop: 12 }]}>{error}</Text> : null}
        <Text style={{ marginTop: 16, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, color: colors.ink3 }}>EVIDENCE · PHOTO</Text>
        <Pressable onPress={takePhoto} style={{ marginTop: 8, minHeight: 96, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: colors.ink4, backgroundColor: colors.cream, padding: 12, justifyContent: "center" }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.ink }}>{photo ? "Photo added" : "Tap to capture"}</Text>
          <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 4 }}>Photo of the finished work on this step.</Text>
        </Pressable>
        <Text style={{ marginTop: 14, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, color: colors.ink3 }}>NOTE</Text>
        <TextInput
          style={[styles.input, { marginTop: 8, minHeight: 48 }]}
          value={note}
          onChangeText={setNote}
          placeholder="What did you finish?"
          placeholderTextColor={colors.ink3}
          multiline
        />
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <Pressable onPress={() => router.back()} style={[styles.button, styles.secondary, { flex: 1, marginTop: 0 }]}>
            <Text style={[styles.buttonText, styles.secondaryText]}>Cancel</Text>
          </Pressable>
          <Pressable onPress={submit} disabled={busy} style={[styles.button, { flex: 1, marginTop: 0, backgroundColor: colors.greenDeep }]}>
            <Text style={styles.buttonText}>{busy ? "Saving…" : "Submit step"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
