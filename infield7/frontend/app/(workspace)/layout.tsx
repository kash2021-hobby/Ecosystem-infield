"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, clearSession, loadSession, type Session } from "@/lib/api";

const managerNav = [
  ["/setup", "Company", "Workspace"],
  ["/employees", "Employees", "Workspace"],
  ["/check-in", "Check in", "Field"],
  ["/sites", "Sites", "Field"],
  ["/attendance", "Attendance", "Field"],
  ["/map", "Live map", "Field"],
  ["/tasks", "Tasks", "Field"],
  ["/alerts", "Alerts", "Field"],
  ["/workflows", "Workflows", "Field"],
  ["/leave", "Leave", "Field"],
  ["/brain", "Business Brain", "Field"],
  ["/brief", "Weekly brief", "Field"],
] as const;

const employeeNav = [
  ["/home", "Home"],
  ["/check-in", "Check in"],
  ["/tasks", "My tasks"],
  ["/leave", "Leave"],
  ["/days", "My days"],
] as const;

const managerOnly = [
  "/setup",
  "/employees",
  "/billing",
  "/sites",
  "/attendance",
  "/map",
  "/alerts",
  "/workflows",
  "/brain",
  "/brief",
  "/reports",
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const current = loadSession();
    if (!current) {
      router.replace("/login");
      return;
    }
    setSession(current);
    const employee = current.user.role === "employee";
    if (employee && managerOnly.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
      router.replace("/home");
    }
  }, [pathname, router]);

  async function logout() {
    const current = loadSession();
    if (current) {
      await api("/auth/logout", { method: "POST", body: JSON.stringify({}) }, current.token).catch(() => undefined);
    }
    clearSession();
    router.replace("/login");
  }

  if (!session) return null;

  const employee = session.user.role === "employee";

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <div className="mark"><span /></div>
          {session.workspace.name || "InField 7"}
        </div>
        {employee ? (
          <div>
            <div className="nav-label">You</div>
            {employeeNav.map(([href, label]) => (
              <Link key={href} className={pathname === href ? "nav-link active" : "nav-link"} href={href}>{label}</Link>
            ))}
          </div>
        ) : (
          <>
            <div>
              <div className="nav-label">Workspace</div>
              {managerNav.filter((item) => item[2] === "Workspace").map(([href, label]) => (
                <Link key={href} className={pathname === href ? "nav-link active" : "nav-link"} href={href}>{label}</Link>
              ))}
              {session.user.role === "admin" ? (
                <Link className={pathname === "/billing" ? "nav-link active" : "nav-link"} href="/billing">Billing</Link>
              ) : null}
            </div>
            <div>
              <div className="nav-label">Field</div>
              {managerNav.filter((item) => item[2] === "Field").map(([href, label]) => (
                <Link key={href} className={pathname === href ? "nav-link active" : "nav-link"} href={href}>{label}</Link>
              ))}
              <Link className={pathname === "/reports" ? "nav-link active" : "nav-link"} href="/reports">Reports</Link>
            </div>
          </>
        )}
        <div className="side-foot">
          <div className="muted" style={{ padding: "0 10px 8px" }}>
            {session.user.name || session.user.phone}
            {employee ? " · field" : ` · ${session.user.role}`}
          </div>
          <button className="nav-item" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
