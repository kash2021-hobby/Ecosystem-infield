"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, loadSession, type Session } from "@/lib/api";

type Item = {
  id: string;
  title: string;
  narrative: string;
  citation: string;
  suggestionTitle: string | null;
  status: string;
};

export default function BriefPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [week, setWeek] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh(current: Session) {
    const body = await api<{ weekStart: string; items: Item[] }>("/brief", {}, current.token);
    setWeek(body.weekStart);
    setItems(body.items);
  }

  useEffect(() => {
    const current = loadSession();
    if (!current) return;
    setSession(current);
    refresh(current).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
  }, []);

  async function act(id: string, action: "accept" | "dismiss") {
    if (!session) return;
    setError("");
    setNotice("");
    try {
      await api(`/brief/${id}/${action}`, { method: "POST", body: "{}" }, session.token);
      setNotice(action === "accept" ? "Accepted. A task was created." : "Dismissed. Nothing was changed.");
      await refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    }
  }

  return (
    <div>
      <h1 className="page-title">Weekly brief</h1>
      <p className="sub">Week of {week || "…"}. A suggestion becomes a task only after you accept it.</p>
      {error ? (
        <div className="error">
          {error}
          {error.includes("Credits") ? <> <Link href="/billing">Open billing</Link></> : null}
        </div>
      ) : null}
      {notice ? <div className="devcode">{notice}</div> : null}
      {items.map((item) => (
        <div className="panel" key={item.id} style={{ marginBottom: 12 }}>
          <strong>{item.title}</strong>
          <p className="sub">{item.narrative}</p>
          <button className="btn secondary" type="button" style={{ marginTop: 0 }} onClick={() => setOpen(open === item.id ? null : item.id)}>
            {open === item.id ? "Hide why" : "Show why"}
          </button>
          {open === item.id ? <p className="sub">Cited from {item.citation}.</p> : null}
          <div className="actions" style={{ marginTop: 12 }}>
            <span className={item.status === "accepted" ? "pill" : "pill pending"}>{item.status}</span>
            {item.status === "pending" && item.suggestionTitle ? (
              <button className="btn" style={{ marginTop: 0, width: "auto" }} onClick={() => act(item.id, "accept")}>
                Accept: {item.suggestionTitle}
              </button>
            ) : null}
            {item.status === "pending" ? (
              <button className="btn secondary" type="button" onClick={() => act(item.id, "dismiss")}>Dismiss</button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
