import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { api } from "@/api";
import { loadSession } from "@/session";
import { colors, styles } from "@/theme";
import type { TaskDetail } from "@/taskDetail";

export default function WorkflowTimeline() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const session = await loadSession();
        if (!session || !id) return;
        setUserId(session.user.id);
        setRole(session.user.role);
        setTask(await api<TaskDetail>(`/tasks/${id}`, {}, session.token));
      })().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [id]),
  );

  const steps = task?.steps.length ? task.steps : [];
  const done = steps.filter((step) => step.status === "done").length;
  const canOpen = (assigneeUserId?: string | null) => role !== "employee" || !assigneeUserId || assigneeUserId === userId;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.card}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.ink }}>{task?.workflowName || task?.title || "Workflow"}</Text>
        <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 4 }}>{done} of {steps.length || 1} steps done</Text>
        <View style={{ flexDirection: "row", gap: 4, marginTop: 12 }}>
          {(steps.length ? steps : [{ status: task?.status }]).map((step, index) => (
            <View
              key={index}
              style={{
                flex: 1,
                height: 5,
                borderRadius: 3,
                backgroundColor: step.status === "done" ? colors.green : step.status === "in_progress" ? colors.amber : colors.cream2,
              }}
            />
          ))}
        </View>
      </View>
      <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.8, color: colors.ink3, marginBottom: 10 }}>HANDOFF CHAIN</Text>
      {steps.map((step) => {
        const tone = step.status === "done" ? colors.green : step.status === "in_progress" ? colors.amber : colors.ink4;
        return (
          <Pressable
            key={step.id}
            onPress={() => (canOpen(step.assigneeUserId) ? router.push(`/task/${step.id}`) : undefined)}
            style={{ flexDirection: "row", gap: 12, marginBottom: 14 }}
          >
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: step.status === "new" ? colors.paper : tone, borderWidth: 2, borderColor: tone, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: step.status === "new" ? colors.ink3 : colors.paper }}>
                {step.status === "done" ? "✓" : step.n}
              </Text>
            </View>
            <View style={[styles.card, { flex: 1, marginBottom: 0 }]}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.ink }}>{step.title}</Text>
              <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 4 }}>
                {step.assignee ?? "Unassigned"} · {step.status}
                {step.lastAt ? ` · ${new Date(step.lastAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}
              </Text>
            </View>
          </Pressable>
        );
      })}
      {steps.length === 0 ? <Text style={styles.sub}>This task is a single step, not a published workflow.</Text> : null}
    </ScrollView>
  );
}
