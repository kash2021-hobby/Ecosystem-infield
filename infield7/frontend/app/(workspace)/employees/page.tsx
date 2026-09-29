"use client";

import { useEffect, useState } from "react";
import { api, loadSession, type Session } from "@/lib/api";

type Employee = {
  id: string;
  name: string;
  phone: string;
  role: string;
  status: string;
  inviteCode: string | null;
};

export default function EmployeesPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<Employee[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("employee");
  const [csv, setCsv] = useState("name,phone,role");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh(current: Session) {
    const body = await api<{ employees: Employee[] }>("/employees", {}, current.token);
    setRows(body.employees);
  }

  useEffect(() => {
    const current = loadSession();
    if (!current) return;
    setSession(current);
    refresh(current).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
  }, []);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    setError("");
    setNotice("");
    try {
      const created = await api<{ inviteCode: string }>("/employees", {
        method: "POST",
        body: JSON.stringify({ name, phone, role }),
      }, session.token);
      setNotice(`Invite code ${created.inviteCode}. It expires in 7 days.`);
      setName("");
      setPhone("");
      await refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add");
    }
  }

  async function importCsv(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    setError("");
    try {
      const result = await api<{ created: { name: string }[]; errors: { line: number; message: string }[] }>(
        "/employees/import",
        { method: "POST", body: JSON.stringify({ csv }) },
        session.token,
      );
      setNotice(`Imported ${result.created.length}. ${result.errors.length ? `${result.errors.length} rows skipped.` : ""}`);
      await refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import");
    }
  }

  return (
    <div>
      <h1 className="page-title">Employees</h1>
      <p className="sub">Invite people with a code. They sign in on the same phone number.</p>
      {error ? <div className="error">{error}</div> : null}
      {notice ? <div className="devcode">{notice}</div> : null}
      <div className="panel" style={{ marginBottom: 16 }}>
        <table>
          <thead>
            <tr><th>Name</th><th>Phone</th><th>Role</th><th>Status</th><th>Invite</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td style={{ fontFamily: "var(--if-mono)" }}>{row.phone}</td>
                <td>{row.role}</td>
                <td><span className={row.status === "active" ? "pill" : "pill pending"}>{row.status}</span></td>
                <td>{row.inviteCode ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid">
        <form className="panel" onSubmit={add}>
          <label htmlFor="ename">Name</label>
          <input id="ename" value={name} onChange={(event) => setName(event.target.value)} required />
          <label htmlFor="ephone" style={{ marginTop: 12 }}>Phone</label>
          <input id="ephone" value={phone} onChange={(event) => setPhone(event.target.value)} required />
          <label htmlFor="erole" style={{ marginTop: 12 }}>Role</label>
          <select id="erole" value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
          <button className="btn">Create invite</button>
        </form>
        <form className="panel" onSubmit={importCsv}>
          <label htmlFor="csv">CSV import</label>
          <textarea id="csv" rows={8} value={csv} onChange={(event) => setCsv(event.target.value)} />
          <button className="btn secondary">Import</button>
        </form>
      </div>
    </div>
  );
}
