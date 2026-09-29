"use client";

import { useEffect, useState } from "react";
import { api, loadSession, type Session } from "@/lib/api";

type Alert = { id: string; kind: string; message: string; status: string; createdAt: string; person: string | null };

export default function AlertsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [start, setStart] = useState("22:00");
  const [end, setEnd] = useState("07:00");
  const [error, setError] = useState("");

  async function refresh(current: Session) {
    const body = await api<{ alerts: Alert[]; quietHours: { startTime: string; endTime: string } }>("/alerts", {}, current.token);
    setAlerts(body.alerts);
    setStart(body.quietHours.startTime);
    setEnd(body.quietHours.endTime);
  }

  useEffect(() => {
    const current = loadSession();
    if (!current) return;
    setSession(current);
    refresh(current).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
  }, []);

  async function acknowledge(id: string) {
    if (!session) return;
    await api(`/alerts/${id}/acknowledge`, { method: "POST", body: "{}" }, session.token);
    await refresh(session);
  }

  async function saveHours(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    setError("");
    try {
      await api("/quiet-hours", { method: "POST", body: JSON.stringify({ startTime: start, endTime: end }) }, session.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }

  return (
    <div>
      <h1 className="page-title">Alerts</h1>
      <p className="sub">Late check-in and leaving a site stay quiet overnight. An SOS still comes through.</p>
      {error ? <div className="error">{error}</div> : null}
      <div className="panel" style={{ marginBottom: 16 }}>
        <table>
          <thead><tr><th>When</th><th>Alert</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {alerts.map((alert) => (
              <tr key={alert.id}>
                <td>{new Date(alert.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</td>
                <td>{alert.message}</td>
                <td><span className={alert.status === "acknowledged" ? "pill" : "pill pending"}>{alert.status}</span></td>
                <td>{alert.status !== "acknowledged" ? <button className="btn secondary" style={{ marginTop: 0 }} onClick={() => acknowledge(alert.id)}>Acknowledge</button> : null}</td>
              </tr>
            ))}
            {alerts.length === 0 ? <tr><td colSpan={4}>No alerts yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <form className="panel" onSubmit={saveHours}>
        <label htmlFor="quiet-start">Quiet from</label>
        <input id="quiet-start" value={start} onChange={(event) => setStart(event.target.value)} />
        <label htmlFor="quiet-end" style={{ marginTop: 12 }}>Until</label>
        <input id="quiet-end" value={end} onChange={(event) => setEnd(event.target.value)} />
        <button className="btn secondary">Save quiet hours</button>
      </form>
    </div>
  );
}
