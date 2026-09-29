"use client";

import { useEffect, useState } from "react";
import { api, loadSession, type Session } from "@/lib/api";

type Policy = { id: string; name: string; body: string };
type Document = { id: string; name: string; body: string };

export default function BrainPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [docName, setDocName] = useState("");
  const [docBody, setDocBody] = useState("");
  const [days, setDays] = useState("90");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh(current: Session) {
    const result = await api<{ policies: Policy[]; documents: Document[]; retentionDays: number }>("/brain", {}, current.token);
    setPolicies(result.policies);
    setDocuments(result.documents);
    setDays(String(result.retentionDays));
  }

  useEffect(() => {
    const current = loadSession();
    if (!current) return;
    setSession(current);
    refresh(current).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
  }, []);

  async function savePolicy(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    setError("");
    await api("/policies", { method: "POST", body: JSON.stringify({ name, body }) }, session.token);
    setName("");
    setBody("");
    await refresh(session);
  }

  async function saveDocument(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    setError("");
    await api("/documents", { method: "POST", body: JSON.stringify({ name: docName, body: docBody }) }, session.token);
    setDocName("");
    setDocBody("");
    await refresh(session);
  }

  async function saveDays(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    setError("");
    setNotice("");
    try {
      const result = await api<{ removed: number }>("/retention", {
        method: "POST",
        body: JSON.stringify({ days: Number(days) }),
      }, session.token);
      setNotice(result.removed ? `Removed ${result.removed} old check-ins.` : "Retention saved. Nothing was old enough to remove.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }

  return (
    <div>
      <h1 className="page-title">Business Brain</h1>
      <p className="sub">Policies are what the weekly brief is allowed to cite. Location history older than the limit is deleted, including check-in photos.</p>
      {error ? <div className="error">{error}</div> : null}
      {notice ? <div className="devcode">{notice}</div> : null}
      <div className="panel" style={{ marginBottom: 16 }}>
        <table>
          <thead><tr><th>Policy</th><th>Rule</th></tr></thead>
          <tbody>
            {policies.map((policy) => (
              <tr key={policy.id}><td>{policy.name}</td><td>{policy.body}</td></tr>
            ))}
            {policies.length === 0 ? <tr><td colSpan={2}>No policies yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="grid">
        <form className="panel" onSubmit={savePolicy}>
          <label htmlFor="pname">Policy name</label>
          <input id="pname" value={name} onChange={(event) => setName(event.target.value)} required />
          <label htmlFor="pbody" style={{ marginTop: 12 }}>In plain language</label>
          <textarea id="pbody" rows={4} value={body} onChange={(event) => setBody(event.target.value)} required />
          <button className="btn">Save policy</button>
        </form>
        <form className="panel" onSubmit={saveDocument}>
          <label htmlFor="dname">Document name</label>
          <input id="dname" value={docName} onChange={(event) => setDocName(event.target.value)} required />
          <label htmlFor="dbody" style={{ marginTop: 12 }}>Text</label>
          <textarea id="dbody" rows={4} value={docBody} onChange={(event) => setDocBody(event.target.value)} required />
          <button className="btn secondary">Save document</button>
        </form>
      </div>
      {documents.length > 0 ? <p className="sub">{documents.length} document{documents.length === 1 ? "" : "s"} stored.</p> : null}
      <form className="panel" onSubmit={saveDays} style={{ marginTop: 16 }}>
        <label htmlFor="days">Keep check-ins for this many days</label>
        <input id="days" value={days} onChange={(event) => setDays(event.target.value)} />
        <button className="btn secondary">Save retention</button>
      </form>
    </div>
  );
}
