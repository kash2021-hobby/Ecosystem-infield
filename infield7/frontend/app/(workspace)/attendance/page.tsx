"use client";

import { useEffect, useState } from "react";
import { api, API_URL, loadSession } from "@/lib/api";

type Row = {
  id: string;
  person: string;
  phone: string;
  site: string | null;
  distance_m: number | null;
  late: boolean;
  checked_in_at: string;
};

export default function AttendancePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");

  async function download() {
    const session = loadSession();
    if (!session) return;
    const response = await fetch(`${API_URL}/attendance.csv`, {
      headers: { authorization: `Bearer ${session.token}` },
    });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "attendance.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    const session = loadSession();
    if (!session) return;
    api<{ checkins: Row[] }>("/attendance", {}, session.token)
      .then((body) => setRows(body.checkins))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
  }, []);

  return (
    <div>
      <h1 className="page-title">Attendance</h1>
      <p className="sub">Check-ins recorded today.</p>
      <button className="btn secondary" style={{ maxWidth: 200, marginBottom: 16 }} onClick={download}>Export CSV</button>
      {error ? <div className="error">{error}</div> : null}
      <div className="panel">
        <table>
          <thead><tr><th>Person</th><th>Site</th><th>Distance</th><th>When</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.person}{row.late ? " · late" : ""}</td>
                <td>{row.site}</td>
                <td>{row.distance_m ?? "—"} m</td>
                <td>{new Date(row.checked_in_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={4}>No check-ins yet today.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
