import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { api } from "@/api";
import { loadSession } from "@/session";
import { colors, styles } from "@/theme";
import type { TaskDetail, Step } from "@/taskDetail";

export default function NextStep() {
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
  const next = steps.find((step) => step.status !== "done");
  const canOpen = (step: Step) => role !== "employee" || !step.assigneeUserId || step.assigneeUserId === userId;

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <View style={{ padding: 20, backgroundColor: colors.greenSoft }}>
        <Text style={{ fontSize: 22, fontWeight: "700", color: colors.ink }}>Step complete</Text>
        <Text style={{ fontSize: 13, color: colors.ink3, marginTop: 4 }}>{task?.title}</Text>
      </View>
      <View style={{ padding: 20 }}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {next ? (
          <>
            <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.8, color: colors.ink3, marginBottom: 8 }}>NEXT STEP · ALREADY ON THE LIST</Text>
            <View style={styles.card}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.ink }}>{next.title}</Text>
              <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 4 }}>
                {next.assignee ? `Assigned to ${next.assignee}` : "Unassigned"}
                {task?.workflowName ? ` · ${task.workflowName}` : ""}
              </Text>
            </View>
            {canOpen(next) ? (
              <Pressable onPress={() => router.replace(`/task/${next.id}`)} style={[styles.button, { backgroundColor: colors.greenDeep }]}>
                <Text style={styles.buttonText}>Open next step</Text>
              </Pressable>
            ) : (
              <Text style={styles.sub}>This step sits on {next.assignee ?? "someone else"}'s list.</Text>
            )}
          </>
        ) : (
          <Text style={styles.sub}>Every step in this chain is done.</Text>
        )}
        <Pressable onPress={() => router.replace("/tasks")} style={[styles.button, styles.secondary]}>
          <Text style={[styles.buttonText, styles.secondaryText]}>Back to tasks</Text>
        </Pressable>
      </View>
    </View>
  );
}
