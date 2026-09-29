"use client";

import { useEffect, useState } from "react";
import { API_URL, api, loadSession, type Session } from "@/lib/api";

type Task = {
  id: string;
  title: string;
  status: string;
  assignee: string | null;
  site: string | null;
  hasPhoto: boolean;
};

function TaskPhoto({ id, token }: { id: string; token: string }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let url = "";
    let ignore = false;
    fetch(`${API_URL}/tasks/${id}/photo`, { headers: { authorization: `Bearer ${token}` } })
      .then((response) => (response.ok ? response.blob() : Promise.reject()))
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (!ignore) setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, token]);

  if (!src) return null;
  return <img src={src} alt="Work photo" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10 }} />;
}
type Employee = { userId: string | null; name: string; phone: string; status: string };
type Site = { id: string; name: string };

export default function TasksPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [siteId, setSiteId] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState("");
  const [error, setError] = useState("");

  async function refresh(current: Session) {
    const body = await api<{ tasks: Task[] }>("/tasks", {}, current.token);
    setTasks(body.tasks);
    if (current.user.role !== "employee") {
      const roster = await api<{ employees: Employee[] }>("/employees", {}, current.token);
      setEmployees(roster.employees.filter((person) => person.status === "active" && person.userId));
      const siteBody = await api<{ sites: Site[] }>("/sites", {}, current.token);
      setSites(siteBody.sites);
    }
  }

  useEffect(() => {
    const current = loadSession();
    if (!current) return;
    setSession(current);
    refresh(current).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    setError("");
    try {
      await api("/tasks", {
        method: "POST",
        body: JSON.stringify({ title, assigneeUserId: assignee || undefined, siteId: siteId || undefined }),
      }, session.token);
      setTitle("");
      await refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the task");
    }
  }

  async function start(id: string) {
    if (!session) return;
    setError("");
    try {
      await api(`/tasks/${id}`, { method: "POST", body: JSON.stringify({ status: "in_progress" }) }, session.token);
      await refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the task");
    }
  }

  async function close(id: string) {
    if (!session) return;
    setError("");
    try {
      if (!photo) {
        setError("Add a photo before closing the task");
        return;
      }
      await api(`/tasks/${id}`, { method: "POST", body: JSON.stringify({ status: "done", note, photoBase64: photo }) }, session.token);
      setNote("");
      setPhoto("");
      await refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the task");
    }
  }

  return (
    <div>
      <h1 className="page-title">Tasks</h1>
      <p className="sub">
        {session?.user.role === "employee"
          ? "Your assigned work. Close a task with a photo of the finished work. A note is optional."
          : "Assign a task, then close it with a photo of the finished work. A note is optional."}
      </p>
      {error ? <div className="error">{error}</div> : null}
      <div className="panel" style={{ marginBottom: 16 }}>
        <table>
          <thead><tr><th>Task</th><th>Person</th><th>Site</th><th>Status</th><th>Photo</th><th></th></tr></thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td>{task.title}</td>
                <td>{task.assignee ?? "—"}</td>
                <td>{task.site ?? "—"}</td>
                <td><span className={task.status === "done" ? "pill" : "pill pending"}>{task.status}</span></td>
                <td>{task.hasPhoto && session ? <TaskPhoto id={task.id} token={session.token} /> : "—"}</td>
                <td>
                  {task.status === "new" ? (
                    <button className="btn secondary" style={{ marginTop: 0 }} onClick={() => start(task.id)}>Start</button>
                  ) : task.status !== "done" ? (
                    <button className="btn secondary" style={{ marginTop: 0 }} onClick={() => close(task.id)}>Done</button>
                  ) : null}
                </td>
              </tr>
            ))}
            {tasks.length === 0 ? <tr><td colSpan={6}>No tasks yet.</td></tr> : null}
          </tbody>
        </table>
        <label htmlFor="photo" style={{ marginTop: 16 }}>Photo of the finished work</label>
        <input
          id="photo"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => setPhoto(String(reader.result));
            reader.readAsDataURL(file);
          }}
        />
        <label htmlFor="note" style={{ marginTop: 16 }}>Note</label>
        <input id="note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Gate replaced" />
      </div>
      {session && session.user.role !== "employee" ? (
        <form className="panel" onSubmit={create}>
          <label htmlFor="title">New task</label>
          <input id="title" value={title} onChange={(event) => setTitle(event.target.value)} required />
          <label htmlFor="assignee" style={{ marginTop: 12 }}>Assign to your phone, or leave open</label>
          <select id="assignee" value={assignee} onChange={(event) => setAssignee(event.target.value)}>
            <option value="">Unassigned</option>
            {employees.map((person) => (
              <option key={person.phone} value={person.userId ?? ""}>{person.name}</option>
            ))}
          </select>
          <label htmlFor="site" style={{ marginTop: 12 }}>Site</label>
          <select id="site" value={siteId} onChange={(event) => setSiteId(event.target.value)}>
            <option value="">None</option>
            {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
          <button className="btn">Create task</button>
        </form>
      ) : null}
    </div>
  );
}
