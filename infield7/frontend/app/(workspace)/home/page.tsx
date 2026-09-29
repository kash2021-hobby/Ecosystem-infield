"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, loadSession, type Session } from "@/lib/api";

type Task = { id: string; title: string; status: string; dueOn?: string | null; site: string | null };
type Leave = { id: string; startDate: string; endDate: string; status: string };
type Person = { phone: string; presentDays: number; late: number; checkins: number };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function monthStart(day: string) {
  return `${day.slice(0, 7)}-01`;
}

export default function EmployeeHome() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [openTasks, setOpenTasks] = useState(0);
  const [toAccept, setToAccept] = useState(0);
  const [inProgress, setInProgress] = useState(0);
  const [nextTask, setNextTask] = useState<Task | null>(null);
  const [leave, setLeave] = useState<Leave[]>([]);
  const [days, setDays] = useState(0);
  const [late, setLate] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const current = loadSession();
    if (!current) return;
    if (current.user.role !== "employee") {
      router.replace("/attendance");
      return;
    }
    setSession(current);
    const today = todayIso();
    Promise.all([
      api<{ tasks: Task[] }>("/tasks", {}, current.token),
      api<{ requests: Leave[] }>("/leave", {}, current.token),
      api<{ people: Person[] }>(`/reports/attendance?from=${monthStart(today)}&to=${today}`, {}, current.token),
    ])
      .then(([taskBody, leaveBody, report]) => {
        const mine = taskBody.tasks;
        const open = mine.filter((task) => task.status !== "done");
        setOpenTasks(open.length);
        setToAccept(mine.filter((task) => task.status === "new").length);
        setInProgress(mine.filter((task) => task.status === "in_progress").length);
        setNextTask(open[0] ?? null);
        setLeave(leaveBody.requests.filter((row) => row.status === "pending"));
        const person = report.people.find((row) => row.phone === current.user.phone);
        setDays(person?.presentDays ?? 0);
        setLate(person?.late ?? 0);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
  }, [router]);

  const name = session?.user.name?.split(" ")[0] || session?.user.phone || "there";

  return (
    <div>
      <h1 className="page-title">Hello, {name}</h1>
      <p className="sub">
        {session?.workspace.name || "Your company"} · check in, close your tasks, and see days present. The manager tools stay off this view.
      </p>
      {error ? <div className="error">{error}</div> : null}

      <div className="grid" style={{ marginBottom: 16 }}>
        <div className="panel">
          <div className="muted">Open tasks</div>
          <div className="price">{openTasks}</div>
          <p className="muted" style={{ marginBottom: 0 }}>{toAccept} to start · {inProgress} in progress</p>
        </div>
        <div className="panel">
          <div className="muted">Days this month</div>
          <div className="price">{days}</div>
          <p className="muted" style={{ marginBottom: 0 }}>{late} late check-in{late === 1 ? "" : "s"}</p>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <strong>Today</strong>
        {nextTask ? (
          <p className="sub" style={{ margin: "8px 0 0" }}>
            Next: {nextTask.title}
            {nextTask.site ? ` · ${nextTask.site}` : ""}
            {nextTask.status === "new" ? " · waiting to start" : ""}
          </p>
        ) : (
          <p className="sub" style={{ margin: "8px 0 0" }}>No open tasks on your list.</p>
        )}
        {leave.length > 0 ? (
          <p className="sub" style={{ margin: "8px 0 0" }}>
            {leave.length} leave request{leave.length === 1 ? "" : "s"} waiting for a manager.
          </p>
        ) : null}
        <div className="actions" style={{ marginTop: 16 }}>
          <Link className="btn" href="/check-in" style={{ width: "auto", textDecoration: "none", display: "inline-block" }}>Check in</Link>
          <Link className="btn secondary" href="/tasks" style={{ width: "auto", textDecoration: "none", display: "inline-block" }}>My tasks</Link>
          <Link className="btn secondary" href="/days" style={{ width: "auto", textDecoration: "none", display: "inline-block" }}>My days</Link>
        </div>
      </div>
    </div>
  );
}
