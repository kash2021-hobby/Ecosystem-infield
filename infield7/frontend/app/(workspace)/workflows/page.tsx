"use client";

import { useEffect, useState } from "react";
import { api, loadSession, type Session } from "@/lib/api";

type Workflow = { id: string; name: string; steps: number; publishedAt: string };

export default function WorkflowsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<Workflow[]>([]);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState("Reach the site\nTake a photo of the gate\nMark the job done");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh(current: Session) {
    const body = await api<{ workflows: Workflow[] }>("/workflows", {}, current.token);
    setRows(body.workflows);
  }

  useEffect(() => {
    const current = loadSession();
    if (!current) return;
    setSession(current);
    refresh(current).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
  }, []);

  async function publish(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    setError("");
    setNotice("");
    try {
      const result = await api<{ tasks: number }>("/workflows", {
        method: "POST",
        body: JSON.stringify({ name, steps: steps.split("\n") }),
      }, session.token);
      setNotice(`Published. ${result.tasks} tasks are now on the task list.`);
      setName("");
      await refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish");
    }
  }

  return (
    <div>
      <h1 className="page-title">Workflows</h1>
      <p className="sub">One step per line. Publishing creates those tasks immediately.</p>
      {error ? <div className="error">{error}</div> : null}
      {notice ? <div className="devcode">{notice}</div> : null}
      <div className="panel" style={{ marginBottom: 16 }}>
        <table>
          <thead><tr><th>Name</th><th>Steps</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}><td>{row.name}</td><td>{row.steps}</td></tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={2}>Nothing published yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {session?.user.role !== "employee" ? (
        <form className="panel" onSubmit={publish}>
          <label htmlFor="wname">Name</label>
          <input id="wname" value={name} onChange={(event) => setName(event.target.value)} required />
          <label htmlFor="steps" style={{ marginTop: 12 }}>Steps</label>
          <textarea id="steps" rows={5} value={steps} onChange={(event) => setSteps(event.target.value)} />
          <button className="btn">Publish</button>
        </form>
      ) : null}
    </div>
  );
}
