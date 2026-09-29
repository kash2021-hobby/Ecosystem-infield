"use client";

import { useEffect, useState } from "react";
import { api, loadSession, type Session } from "@/lib/api";

type Leave = { id: string; person: string; startDate: string; endDate: string; reason: string | null; status: string };

export default function LeavePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<Leave[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  async function refresh(current: Session) {
    const body = await api<{ requests: Leave[] }>("/leave", {}, current.token);
    setRows(body.requests);
  }

  useEffect(() => {
    const current = loadSession();
    if (!current) return;
    setSession(current);
    refresh(current).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    setError("");
    try {
      await api("/leave", { method: "POST", body: JSON.stringify({ startDate, endDate, reason }) }, session.token);
      setReason("");
      await refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request leave");
    }
  }

  async function decide(id: string, status: "approved" | "rejected") {
    if (!session) return;
    await api(`/leave/${id}`, { method: "POST", body: JSON.stringify({ status }) }, session.token);
    await refresh(session);
  }

  const manager = session?.user.role !== "employee";

  return (
    <div>
      <h1 className="page-title">Leave</h1>
      <p className="sub">Ask for days away. A manager approves or rejects the request.</p>
      {error ? <div className="error">{error}</div> : null}
      <div className="panel" style={{ marginBottom: 16 }}>
        <table>
          <thead><tr><th>Person</th><th>Dates</th><th>Reason</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.person}</td>
                <td>{row.startDate} to {row.endDate}</td>
                <td>{row.reason || "—"}</td>
                <td><span className={row.status === "approved" ? "pill" : "pill pending"}>{row.status}</span></td>
                <td>
                  {manager && row.status === "pending" ? (
                    <span className="actions">
                      <button className="btn secondary" type="button" onClick={() => decide(row.id, "approved")}>Approve</button>
                      <button className="btn secondary" type="button" onClick={() => decide(row.id, "rejected")}>Reject</button>
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={5}>No leave requests.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <form className="panel" onSubmit={submit}>
        <div className="grid">
          <div>
            <label htmlFor="from">From</label>
            <input id="from" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
          </div>
          <div>
            <label htmlFor="to">To</label>
            <input id="to" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required />
          </div>
        </div>
        <label htmlFor="reason" style={{ marginTop: 12 }}>Reason</label>
        <input id="reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        <button className="btn">Request leave</button>
      </form>
    </div>
  );
}
