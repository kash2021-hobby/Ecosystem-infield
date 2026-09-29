"use client";

import { useEffect, useState } from "react";
import { api, loadSession, type Session } from "@/lib/api";

type Person = { person: string; phone: string; presentDays: number; late: number; checkins: number };
type Row = { day: string; person: string; phone: string; site: string | null; late: boolean; checkedInAt: string };
type Report = { from: string; to: string; totals: { people: number; checkins: number; late: number }; people: Person[]; rows: Row[] };

export default function ReportsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");

  async function load(current: Session, start = from, end = to) {
    const params = new URLSearchParams();
    if (start) params.set("from", start);
    if (end) params.set("to", end);
    const query = params.toString();
    const body = await api<Report>(`/reports/attendance${query ? `?${query}` : ""}`, {}, current.token);
    setReport(body);
    setFrom(body.from);
    setTo(body.to);
  }

  useEffect(() => {
    const current = loadSession();
    if (!current) return;
    setSession(current);
    load(current).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
  }, []);

  function download() {
    if (!report) return;
    const lines = ["day,person,phone,site,late,checked_in_at"];
    for (const row of report.rows) {
      lines.push([row.day, row.person, row.phone, row.site ?? "", row.late ? "yes" : "no", row.checkedInAt].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `attendance-${report.from}-to-${report.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h1 className="page-title">Attendance report</h1>
      <p className="sub">Who checked in, and who was late, for the dates you pick. This is the saved attendance record, not a generated brief.</p>
      {error ? <div className="error">{error}</div> : null}
      <form
        className="panel"
        style={{ marginBottom: 16 }}
        onSubmit={(event) => {
          event.preventDefault();
          if (!session) return;
          setError("");
          load(session).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
        }}
      >
        <div className="grid">
          <div>
            <label htmlFor="from">From</label>
            <input id="from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} required />
          </div>
          <div>
            <label htmlFor="to">To</label>
            <input id="to" type="date" value={to} onChange={(event) => setTo(event.target.value)} required />
          </div>
        </div>
        <div className="actions">
          <button className="btn" type="submit" style={{ width: "auto" }}>Show report</button>
          <button className="btn secondary" type="button" onClick={download} disabled={!report?.rows.length}>Download CSV</button>
        </div>
      </form>
      <div className="grid" style={{ marginBottom: 16 }}>
        <div className="panel"><div className="muted">People</div><div className="price">{report?.totals.people ?? 0}</div></div>
        <div className="panel"><div className="muted">Check-ins</div><div className="price">{report?.totals.checkins ?? 0}</div></div>
        <div className="panel"><div className="muted">Late</div><div className="price">{report?.totals.late ?? 0}</div></div>
      </div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <table>
          <thead><tr><th>Person</th><th>Days present</th><th>Late</th><th>Check-ins</th></tr></thead>
          <tbody>
            {report?.people.map((person) => (
              <tr key={person.phone}>
                <td>{person.person}<div className="muted">{person.phone}</div></td>
                <td>{person.presentDays}</td>
                <td>{person.late}</td>
                <td>{person.checkins}</td>
              </tr>
            ))}
            {report && report.people.length === 0 ? <tr><td colSpan={4}>No check-ins in this range.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <table>
          <thead><tr><th>Day</th><th>Person</th><th>Site</th><th>Late</th></tr></thead>
          <tbody>
            {report?.rows.map((row) => (
              <tr key={`${row.checkedInAt}-${row.phone}`}>
                <td>{row.day}</td>
                <td>{row.person}</td>
                <td>{row.site ?? "—"}</td>
                <td>{row.late ? "Yes" : "No"}</td>
              </tr>
            ))}
            {report && report.rows.length === 0 ? <tr><td colSpan={4}>No check-ins in this range.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
