import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/api";
import { ScreenShell } from "@/chrome";
import { loadSession, type Session } from "@/session";
import { colors, styles } from "@/theme";

type Task = {
  id: string;
  title: string;
  status: string;
  dueOn: string | null;
  assignee: string | null;
  site: string | null;
  hasPhoto: boolean;
  workflowId: string | null;
  workflowName: string | null;
  createdAt: string;
  stepN: number;
  stepTotal: number;
  stepDone: number;
  previousTitle: string | null;
  previousPerson: string | null;
};

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function dueDay(task: Task) {
  return task.dueOn ? task.dueOn.slice(0, 10) : null;
}

function ago(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function dueLabel(task: Task, today: string) {
  const day = dueDay(task);
  if (!day) return "No due date";
  if (day < today) return `Overdue · ${day}`;
  if (day === today) return "Today";
  return day;
}

export default function Tasks() {
  const [session, setSession] = useState<Session | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState("");
  const [closingId, setClosingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const current = await loadSession();
    if (!current) return;
    setSession(current);
    const body = await api<{ tasks: Task[] }>("/tasks", {}, current.token);
    setTasks(body.tasks);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  const today = todayIso();
  const groups = useMemo(() => {
    const toAccept = tasks.filter((task) => task.status === "new" && task.workflowId);
    const inProgress = tasks.filter((task) => task.status === "in_progress");
    const due = tasks.filter((task) => {
      if (task.status !== "new" || task.workflowId) return false;
      const day = dueDay(task);
      return !day || day <= today;
    });
    const later = tasks.filter((task) => {
      if (task.status !== "new" || task.workflowId) return false;
      const day = dueDay(task);
      return Boolean(day && day > today);
    });
    const doneToday = tasks.filter((task) => {
      if (task.status !== "done") return false;
      const day = dueDay(task);
      return !day || day === today;
    });
    return { toAccept, inProgress, due, later, doneToday };
  }, [tasks, today]);

  async function takePhoto() {
    setError("");
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Camera permission is required for the work photo.");
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.4 });
    if (shot.canceled || !shot.assets[0]?.base64) return;
    setPhoto(`data:image/jpeg;base64,${shot.assets[0].base64}`);
  }

  async function accept(id: string) {
    if (!session) return;
    setError("");
    try {
      await api(`/tasks/${id}`, { method: "POST", body: JSON.stringify({ status: "in_progress" }) }, session.token);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept the task");
    }
  }

  async function close(id: string) {
    if (!session) return;
    if (!photo) {
      setClosingId(id);
      setError("Take a photo of the finished work, then tap Mark done.");
      return;
    }
    setError("");
    try {
      await api(`/tasks/${id}`, {
        method: "POST",
        body: JSON.stringify({ status: "done", note, photoBase64: photo }),
      }, session.token);
      setNote("");
      setPhoto("");
      setClosingId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the task");
    }
  }

  const who = session?.user.name || session?.user.phone || "You";
  const role = session?.user.role === "employee" ? "Field" : session?.user.role ?? "";

  return (
    <ScreenShell>
      <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: 24 }}>
        <Text style={[styles.sub, { paddingHorizontal: 20, paddingTop: 4 }]}>
          {who}
          {role ? ` · ${role}` : ""}
          {session?.user.role === "employee" ? "" : " · whole company"}
        </Text>
        {error ? <Text style={[styles.error, { marginHorizontal: 20 }]}>{error}</Text> : null}

        <View style={{ paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", gap: 8 }}>
          <Stat label="To accept" value={groups.toAccept.length} tone="coral" />
          <Stat label="In progress" value={groups.inProgress.length} tone="amber" />
          <Stat label="Done today" value={groups.doneToday.length} tone="green" />
        </View>

        <Section title="Action needed" />
        <View style={{ paddingHorizontal: 16, gap: 8, marginBottom: 8 }}>
          {groups.toAccept.length === 0 ? (
            <Text style={[styles.sub, { marginBottom: 8 }]}>No workflow handoffs waiting.</Text>
          ) : null}
          {groups.toAccept.map((task) => (
            <View key={task.id} style={[styles.card, { borderLeftWidth: 4, borderLeftColor: colors.coral }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <Chip label="Auto-suggested" background={colors.coralSoft} color={colors.coral} />
                <Text style={{ fontSize: 10, color: colors.ink3 }}>
                  {task.workflowName ? `${task.workflowName} · ` : "from workflow · "}
                  {ago(task.createdAt)}
                </Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.ink }}>{task.title}</Text>
              <Text style={[styles.sub, { marginTop: 4, marginBottom: 0, fontSize: 12 }]}>
                {task.previousPerson && task.previousTitle
                  ? `Created after ${task.previousPerson} finished “${task.previousTitle}”. Accept to add it to your list.`
                  : "This step is ready. Accept to add it to your list."}
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <Pressable onPress={() => accept(task.id)} style={[styles.button, { flex: 1, marginTop: 0 }]}>
                  <Text style={styles.buttonText}>Accept</Text>
                </Pressable>
                <Pressable onPress={() => router.push(`/task/${task.id}`)} style={[styles.button, styles.secondary, { marginTop: 0 }]}>
                  <Text style={[styles.buttonText, styles.secondaryText]}>View</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        <Section title="In progress" />
        <View style={{ paddingHorizontal: 16, gap: 8, marginBottom: 8 }}>
          {groups.inProgress.length === 0 ? <Text style={[styles.sub, { marginBottom: 8 }]}>Nothing in progress.</Text> : null}
          {groups.inProgress.map((task) => (
            <WorkCard
              key={task.id}
              task={task}
              today={today}
              photo={photo}
              closingId={closingId}
              onOpen={() => router.push(`/task/${task.id}`)}
              onPhoto={takePhoto}
              onDone={() => close(task.id)}
              onNote={setNote}
              note={note}
            />
          ))}
        </View>

        {groups.inProgress.length > 0 ? (
          <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
            <Pressable style={[styles.button, styles.secondary, { marginTop: 0 }]} onPress={takePhoto}>
              <Text style={[styles.buttonText, styles.secondaryText]}>{photo ? "Photo added" : "Take work photo"}</Text>
            </Pressable>
            <TextInput
              style={styles.input}
              value={note}
              onChangeText={setNote}
              placeholder="Optional note when you mark done"
              placeholderTextColor={colors.ink3}
            />
          </View>
        ) : null}

        <Section title="Due today" />
        <View style={{ paddingHorizontal: 16, gap: 8, marginBottom: 8 }}>
          {groups.due.length === 0 ? <Text style={[styles.sub, { marginBottom: 8 }]}>No other tasks due today.</Text> : null}
          {groups.due.map((task) => (
            <View key={task.id} style={styles.card}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: dueDay(task) && dueDay(task)! < today ? colors.coral : colors.ink3 }}>
                {dueLabel(task, today)}
              </Text>
              <Pressable onPress={() => router.push(`/task/${task.id}`)}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink, marginTop: 6 }}>{task.title}</Text>
              </Pressable>
              <Text style={[styles.sub, { marginTop: 4, marginBottom: 0 }]}>
                {task.site ?? "No site"}
                {task.assignee ? ` · ${task.assignee}` : ""}
              </Text>
              <Pressable onPress={() => accept(task.id)} style={[styles.button, { marginTop: 12 }]}>
                <Text style={styles.buttonText}>Start</Text>
              </Pressable>
            </View>
          ))}
        </View>

        {groups.later.length > 0 ? (
          <>
            <Section title="Later" />
            <View style={{ paddingHorizontal: 16, gap: 8, marginBottom: 8 }}>
              {groups.later.map((task) => (
                <Pressable key={task.id} onPress={() => router.push(`/task/${task.id}`)} style={styles.card}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.ink3 }}>{dueLabel(task, today)}</Text>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink, marginTop: 6 }}>{task.title}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <Section title="Done today" />
        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          {groups.doneToday.length === 0 ? <Text style={styles.sub}>Nothing closed today.</Text> : null}
          {groups.doneToday.map((task) => (
            <Pressable key={task.id} onPress={() => router.push(`/task/${task.id}`)} style={styles.card}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink }}>{task.title}</Text>
              <Text style={[styles.sub, { marginTop: 4, marginBottom: 0 }]}>
                {task.site ?? "No site"}
                {task.hasPhoto ? " · photo on file" : ""}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "coral" | "amber" | "green" }) {
  const dot = tone === "green" ? colors.green : tone === "amber" ? colors.amber : colors.coral;
  return (
    <View style={[styles.card, { flex: 1, marginBottom: 0, padding: 12 }]}>
      <Text style={{ fontSize: 10, color: colors.ink3, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase" }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 4 }}>
        <Text style={{ fontSize: 22, fontWeight: "700", color: colors.ink }}>{value}</Text>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} />
      </View>
    </View>
  );
}

function Section({ title }: { title: string }) {
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.ink3 }}>{title}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.cream2 }} />
    </View>
  );
}

function Chip({ label, background, color }: { label: string; background: string; color: string }) {
  return (
    <View style={{ backgroundColor: background, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ color, fontSize: 11, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

function WorkCard({
  task,
  today,
  photo,
  closingId,
  onOpen,
  onPhoto,
  onDone,
  onNote,
  note,
}: {
  task: Task;
  today: string;
  photo: string;
  closingId: string | null;
  onOpen: () => void;
  onPhoto: () => void;
  onDone: () => void;
  onNote: (value: string) => void;
  note: string;
}) {
  const overdue = Boolean(dueDay(task) && dueDay(task)! < today);
  const total = task.stepTotal || 1;
  const done = task.stepDone;
  const width = Math.round((done / total) * 100);
  return (
    <View style={[styles.card, overdue ? { borderLeftWidth: 4, borderLeftColor: colors.coral } : { borderLeftWidth: 4, borderLeftColor: colors.amber }]}>
      <Pressable onPress={onOpen}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.ink }}>{task.title}</Text>
      </Pressable>
      <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 4 }}>
        {task.assignee ?? "Unassigned"}
        {task.site ? ` · ${task.site}` : ""}
      </Text>
      {task.stepTotal > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
          <View style={{ flex: 1, height: 6, borderRadius: 4, backgroundColor: colors.cream2, overflow: "hidden" }}>
            <View style={{ width: `${width}%`, height: "100%", backgroundColor: overdue ? colors.coral : colors.green }} />
          </View>
          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.ink3 }}>
            {task.stepN}/{task.stepTotal} steps
          </Text>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        <Chip
          label={dueLabel(task, today)}
          background={overdue ? colors.coralSoft : "#F8EFD6"}
          color={overdue ? colors.coral : "#8A5A10"}
        />
        {task.workflowName ? (
          <Chip label={task.workflowName} background={colors.cream} color={colors.ink3} />
        ) : null}
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <Pressable onPress={onPhoto} style={[styles.button, styles.secondary, { flex: 1, marginTop: 0 }]}>
          <Text style={[styles.buttonText, styles.secondaryText]}>{photo ? "Photo added" : "Photo"}</Text>
        </Pressable>
        <Pressable onPress={onDone} style={[styles.button, { flex: 1, marginTop: 0 }]}>
          <Text style={styles.buttonText}>{closingId === task.id && !photo ? "Need photo" : "Mark done"}</Text>
        </Pressable>
      </View>
      {closingId === task.id ? (
        <TextInput
          style={[styles.input, { marginTop: 8, marginBottom: 0 }]}
          value={note}
          onChangeText={onNote}
          placeholder="Optional note"
          placeholderTextColor={colors.ink3}
        />
      ) : null}
    </View>
  );
}
