import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { api } from "@/api";
import { loadSession, type Session } from "@/session";
import { colors, styles } from "@/theme";
import type { TaskDetail, Step } from "@/taskDetail";

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const current = await loadSession();
    if (!current || !id) return;
    setSession(current);
    setTask(await api<TaskDetail>(`/tasks/${id}`, {}, current.token));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  async function start(stepId: string) {
    if (!session) return;
    setError("");
    try {
      await api(`/tasks/${stepId}`, { method: "POST", body: JSON.stringify({ status: "in_progress" }) }, session.token);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start");
    }
  }

  if (!task) {
    return (
      <View style={styles.screen}>
        {error ? <Text style={styles.error}>{error}</Text> : <Text style={styles.sub}>Loading…</Text>}
      </View>
    );
  }

  const steps = task.steps.length ? task.steps : [{ id: task.id, title: task.title, status: task.status, n: 1, assigneeUserId: null }];
  const doneCount = steps.filter((step) => step.status === "done").length;
  const canAct = (step: Step) => session?.user.role !== "employee" || !step.assigneeUserId || step.assigneeUserId === session.user.id;
  const nextOpen = steps.find((step) => step.status !== "done");
  const active = steps.find((step) => step.status !== "done" && canAct(step));

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24 }}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.card}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.cream, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.ink }}>{doneCount}/{steps.length}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.ink }}>{task.workflowName || task.title}</Text>
              <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 4 }}>
                {task.site ?? "No site"}
                {task.assignee ? ` · ${task.assignee}` : ""}
                {task.dueOn ? ` · due ${task.dueOn.slice(0, 10)}` : ""}
              </Text>
            </View>
          </View>
        </View>

        <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1, color: colors.ink3, marginBottom: 8 }}>STEPS TO COMPLETE</Text>
        {steps.map((step) => {
          const isActive = nextOpen?.id === step.id;
          const done = step.status === "done";
          return (
            <View
              key={step.id}
              style={[
                styles.card,
                {
                  borderLeftWidth: 4,
                  borderLeftColor: done ? colors.green : isActive ? colors.amber : colors.cream2,
                  backgroundColor: isActive ? "#F8EFD6" : colors.paper,
                },
              ]}
            >
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: done ? colors.green : isActive ? colors.ink : colors.cream2,
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <Text style={{ color: done || isActive ? colors.paper : colors.ink3, fontWeight: "700", fontSize: 12 }}>
                    {done ? "✓" : step.n}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: done ? colors.ink3 : colors.ink, textDecorationLine: done ? "line-through" : "none" }}>
                    {step.title}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 4 }}>
                    {step.assignee ? `${step.assignee} · ` : ""}
                    {done ? "Submitted with a photo" : "Photo of the finished work"}
                  </Text>
                  {isActive && canAct(step) && step.status === "new" ? (
                    <Pressable onPress={() => start(step.id)} style={[styles.button, { marginTop: 10, alignSelf: "flex-start", paddingHorizontal: 14 }]}>
                      <Text style={styles.buttonText}>Start this step</Text>
                    </Pressable>
                  ) : null}
                  {isActive && canAct(step) && step.status !== "new" && step.status !== "done" ? (
                    <Pressable onPress={() => router.push(`/task/${step.id}/update`)} style={[styles.button, { marginTop: 10, alignSelf: "flex-start", paddingHorizontal: 14 }]}>
                      <Text style={styles.buttonText}>Mark step done</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          );
        })}

        {task.workflowName ? (
          <Pressable onPress={() => router.push(`/task/${task.id}/workflow`)} style={{ padding: 12, borderRadius: 12, backgroundColor: colors.greenSoft, marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: colors.ink, lineHeight: 18 }}>
              {task.workflowName} · {doneCount} of {steps.length} done. Tap for the handoff chain.
            </Text>
          </Pressable>
        ) : null}

        {task.updates.length ? (
          <>
            <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1, color: colors.ink3, marginBottom: 8 }}>UPDATES ON THIS STEP</Text>
            <View style={styles.card}>
              {task.updates.map((item, index) => (
                <View key={item.id} style={{ paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderTopColor: colors.cream2 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.ink }}>{item.person}</Text>
                  <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
                    {new Date(item.createdAt).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                    {item.hasPhoto ? " · photo" : ""}
                  </Text>
                  {item.note ? <Text style={{ fontSize: 13, color: colors.ink, marginTop: 4 }}>{item.note}</Text> : null}
                </View>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
      <View style={{ flexDirection: "row", gap: 8, padding: 16, backgroundColor: colors.paper, borderTopWidth: 1, borderTopColor: colors.cream2 }}>
        <Pressable onPress={() => router.push(`/task/${task.id}/delay`)} style={[styles.button, styles.secondary, { marginTop: 0, paddingHorizontal: 14 }]}>
          <Text style={[styles.buttonText, styles.secondaryText]}>Delay</Text>
        </Pressable>
        {active ? (
          <Pressable onPress={() => router.push(`/task/${active.id}/update`)} style={[styles.button, { flex: 1, marginTop: 0 }]}>
            <Text style={styles.buttonText}>Update progress</Text>
          </Pressable>
        ) : (
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Text style={[styles.sub, { marginBottom: 0 }]}>Every step is done.</Text>
          </View>
        )}
      </View>
    </View>
  );
}
