"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, loadSession, type Session } from "@/lib/api";

type Person = { person: string; phone: string; presentDays: number; late: number; checkins: number };

function monthStart(day: string) {
  return `${day.slice(0, 7)}-01`;
}

function monthLabel(day: string) {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function weekdaysBetween(from: string, to: string) {
  let count = 0;
  let day = from;
  while (day <= to) {
    const weekday = new Date(`${day}T00:00:00`).getDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
    const [year, month, date] = day.split("-").map(Number);
    day = new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
  }
  return count;
}

export default function MyDaysPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [mine, setMine] = useState<Person | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const current = loadSession();
    if (!current) return;
    if (current.user.role !== "employee") {
      router.replace("/reports");
      return;
    }
    setSession(current);
    const today = new Date().toISOString().slice(0, 10);
    api<{ from: string; to: string; people: Person[] }>(
      `/reports/attendance?from=${monthStart(today)}&to=${today}`,
      {},
      current.token,
    )
      .then((report) => {
        setFrom(report.from);
        setTo(report.to);
        setMine(
          report.people.find((person) => person.phone === current.user.phone) ?? {
            person: current.user.name || "You",
            phone: current.user.phone,
            presentDays: 0,
            late: 0,
            checkins: 0,
          },
        );
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
  }, [router]);

  const weekdays = useMemo(() => (from && to ? weekdaysBetween(from, to) : 0), [from, to]);

  return (
    <div>
      <h1 className="page-title">My days</h1>
      <p className="sub">{to ? monthLabel(to) : "This month"} · counted from check-in. Pay amounts stay off this page.</p>
      {error ? <div className="error">{error}</div> : null}
      {mine ? (
        <div className="panel">
          <div className="muted">Days present</div>
          <div className="price">{mine.presentDays}</div>
          <p className="muted">
            {weekdays} weekdays so far · {mine.checkins} check-in{mine.checkins === 1 ? "" : "s"} · {mine.late} late
          </p>
          <p className="sub" style={{ marginBottom: 0 }}>
            {session?.workspace.name || "This company"} counts a day when you check in inside a site fence.
          </p>
        </div>
      ) : null}
    </div>
  );
}
