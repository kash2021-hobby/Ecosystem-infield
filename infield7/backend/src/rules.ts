import { randomUUID } from "node:crypto";
import { db, type UserRow } from "./db.js";
import { HttpError, loadWorkspace } from "./auth.js";
import { distanceMeters, listAttendance } from "./field.js";

type Kind = "late_checkin" | "geofence_exit" | "sos" | "task_delay";

function minutesOf(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function minutesNow(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

async function personName(userId: string) {
  const rows = await db.query<{ name: string }>(
    `SELECT COALESCE(u.name, e.name, u.phone) AS name
     FROM users u LEFT JOIN employees e ON e.user_id = u.id
     WHERE u.id = $1 LIMIT 1`,
    [userId],
  );
  return rows.rows[0]?.name ?? "Someone";
}

export async function ensureRules(workspaceId: string) {
  const existing = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM alert_rules WHERE workspace_id = $1`,
    [workspaceId],
  );
  if (Number(existing.rows[0]?.n ?? 0) > 0) return;
  for (const kind of ["late_checkin", "geofence_exit", "sos"] as const) {
    await db.query(
      `INSERT INTO alert_rules (id, workspace_id, kind) VALUES ($1, $2, $3)`,
      [randomUUID(), workspaceId, kind],
    );
  }
  await db.query(
    `INSERT INTO quiet_hours (workspace_id) VALUES ($1) ON CONFLICT (workspace_id) DO NOTHING`,
    [workspaceId],
  );
}

async function isQuiet(workspaceId: string) {
  const workspace = await loadWorkspace(workspaceId);
  const hours = await db.query<{ start_time: string; end_time: string }>(
    `SELECT start_time, end_time FROM quiet_hours WHERE workspace_id = $1`,
    [workspaceId],
  );
  const start = minutesOf(hours.rows[0]?.start_time ?? "22:00");
  const end = minutesOf(hours.rows[0]?.end_time ?? "07:00");
  const now = minutesNow(workspace.timezone);
  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

export async function raiseAlert(workspaceId: string, userId: string, kind: Kind, message: string) {
  await ensureRules(workspaceId);
  const rule = await db.query<{ enabled: boolean }>(
    `SELECT enabled FROM alert_rules WHERE workspace_id = $1 AND kind = $2`,
    [workspaceId, kind],
  );
  if (rule.rows[0] && rule.rows[0].enabled === false) return null;
  if (kind !== "task_delay") {
    const open = await db.query<{ id: string }>(
      `SELECT id FROM alerts
       WHERE workspace_id = $1 AND user_id = $2 AND kind = $3
         AND status IN ('open', 'held', 'escalated')
         AND created_at::date = CURRENT_DATE
       LIMIT 1`,
      [workspaceId, userId, kind],
    );
    if (open.rows[0]) return { id: open.rows[0].id, duplicate: true };
  }
  const quiet = kind !== "sos" && kind !== "task_delay" && (await isQuiet(workspaceId));
  const id = randomUUID();
  await db.query(
    `INSERT INTO alerts (id, workspace_id, user_id, kind, message, status) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, workspaceId, userId, kind, message, quiet ? "held" : "open"],
  );
  return { id, duplicate: false, held: quiet };
}

export async function sweepEscalations(workspaceId: string) {
  await db.query(
    `UPDATE alerts a
     SET status = 'escalated'
     FROM alert_rules r
     WHERE a.workspace_id = $1
       AND r.workspace_id = a.workspace_id
       AND r.kind = a.kind
       AND a.status = 'open'
       AND a.created_at < now() - make_interval(mins => r.escalate_after_min)`,
    [workspaceId],
  );
}

export async function listAlerts(workspaceId: string) {
  await ensureRules(workspaceId);
  await sweepEscalations(workspaceId);
  const alerts = await db.query<{
    id: string;
    kind: string;
    message: string;
    status: string;
    created_at: string;
    user_id: string | null;
    person: string | null;
  }>(
    `SELECT a.id, a.kind, a.message, a.status, a.created_at, a.user_id, COALESCE(u.name, e.name, u.phone) AS person
     FROM alerts a
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN employees e ON e.user_id = u.id AND e.workspace_id = a.workspace_id
     WHERE a.workspace_id = $1
     ORDER BY a.created_at DESC
     LIMIT 50`,
    [workspaceId],
  );
  const rules = await db.query<{ kind: string; enabled: boolean; escalate_after_min: number }>(
    `SELECT kind, enabled, escalate_after_min FROM alert_rules WHERE workspace_id = $1`,
    [workspaceId],
  );
  const quiet = await db.query<{ start_time: string; end_time: string }>(
    `SELECT start_time, end_time FROM quiet_hours WHERE workspace_id = $1`,
    [workspaceId],
  );
  return {
    alerts: alerts.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
      userId: row.user_id,
      person: row.person,
    })),
    rules: rules.rows,
    quietHours: quiet.rows[0]
      ? { startTime: quiet.rows[0].start_time, endTime: quiet.rows[0].end_time }
      : { startTime: "22:00", endTime: "07:00" },
  };
}

export async function acknowledgeAlert(workspaceId: string, alertId: string) {
  const rows = await db.query<{ id: string }>(
    `UPDATE alerts SET status = 'acknowledged' WHERE id = $1 AND workspace_id = $2 RETURNING id`,
    [alertId, workspaceId],
  );
  if (!rows.rows[0]) throw new HttpError(404, "Alert not found");
  return { id: alertId, status: "acknowledged" };
}

export async function saveQuietHours(workspaceId: string, startTime: string, endTime: string) {
  await ensureRules(workspaceId);
  await db.query(
    `INSERT INTO quiet_hours (workspace_id, start_time, end_time) VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id) DO UPDATE SET start_time = $2, end_time = $3`,
    [workspaceId, startTime, endTime],
  );
  return { startTime, endTime };
}

export async function raiseSos(user: UserRow) {
  const name = await personName(user.id);
  return raiseAlert(user.workspace_id, user.id, "sos", `${name} sent an SOS.`);
}

export async function raiseTaskDelay(user: UserRow, taskId: string, reason: string, detail?: string) {
  const rows = await db.query<{ title: string; assignee_user_id: string | null }>(
    `SELECT title, assignee_user_id FROM tasks WHERE id = $1 AND workspace_id = $2`,
    [taskId, user.workspace_id],
  );
  const task = rows.rows[0];
  if (!task) throw new HttpError(404, "Task not found");
  if (user.role === "employee" && task.assignee_user_id !== user.id) {
    throw new HttpError(403, "You do not have access to this");
  }
  const name = await personName(user.id);
  const extra = detail?.trim() ? ` ${detail.trim()}` : "";
  return raiseAlert(
    user.workspace_id,
    user.id,
    "task_delay",
    `${name} delayed "${task.title}": ${reason}.${extra}`,
  );
}

export async function raiseLate(user: UserRow, site: string) {
  const name = await personName(user.id);
  return raiseAlert(user.workspace_id, user.id, "late_checkin", `${name} checked in late at ${site}.`);
}

export async function recordPresence(user: UserRow, lat: number, lng: number, accuracyM: number) {
  if (accuracyM > 80) throw new HttpError(400, "Location is not accurate enough.");
  const previous = await db.query<{ site_id: string | null }>(
    `SELECT site_id FROM positions WHERE user_id = $1`,
    [user.id],
  );
  const siteId = previous.rows[0]?.site_id;
  let left: string | null = null;
  if (siteId) {
    const sites = await db.query<{ id: string; name: string; lat: number; lng: number; radius_m: number }>(
      `SELECT id, name, lat, lng, radius_m FROM sites WHERE id = $1`,
      [siteId],
    );
    const site = sites.rows[0];
    if (site) {
      const distance = distanceMeters(lat, lng, site.lat, site.lng);
      const outside = distance > site.radius_m;
      const uncertain = outside && distance - accuracyM <= site.radius_m;
      if (outside && !uncertain) {
        left = site.name;
        await raiseAlert(user.workspace_id, user.id, "geofence_exit", `${await personName(user.id)} left ${site.name}.`);
      }
    }
  }
  await db.query(
    `INSERT INTO positions (user_id, workspace_id, lat, lng, accuracy_m, site_id, recorded_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (user_id) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, accuracy_m = EXCLUDED.accuracy_m, site_id = EXCLUDED.site_id, recorded_at = now()`,
    [user.id, user.workspace_id, lat, lng, accuracyM, left ? null : siteId],
  );
  return { left };
}

export async function publishWorkflow(
  workspaceId: string,
  input: { name: string; steps: string[]; assigneeUserId?: string },
) {
  const steps = input.steps.map((step) => step.trim()).filter(Boolean);
  if (steps.length === 0) throw new HttpError(400, "Add at least one step");
  const id = randomUUID();
  await db.query(
    `INSERT INTO workflows (id, workspace_id, name, assignee_user_id, published_at) VALUES ($1, $2, $3, $4, now())`,
    [id, workspaceId, input.name.trim(), input.assigneeUserId || null],
  );
  for (let index = 0; index < steps.length; index += 1) {
    await db.query(
      `INSERT INTO workflow_steps (id, workflow_id, position, title) VALUES ($1, $2, $3, $4)`,
      [randomUUID(), id, index + 1, steps[index]],
    );
    await db.query(
      `INSERT INTO tasks (id, workspace_id, title, assignee_user_id, status, workflow_id) VALUES ($1, $2, $3, $4, 'new', $5)`,
      [randomUUID(), workspaceId, steps[index], input.assigneeUserId || null, id],
    );
  }
  return { id, tasks: steps.length };
}

export async function listWorkflows(workspaceId: string) {
  const rows = await db.query<{ id: string; name: string; published_at: string; steps: number }>(
    `SELECT w.id, w.name, w.published_at, count(s.id)::int AS steps
     FROM workflows w
     LEFT JOIN workflow_steps s ON s.workflow_id = w.id
     WHERE w.workspace_id = $1
     GROUP BY w.id
     ORDER BY w.created_at DESC`,
    [workspaceId],
  );
  return rows.rows.map((row) => ({
    id: row.id,
    name: row.name,
    publishedAt: row.published_at,
    steps: Number(row.steps),
  }));
}

export async function requestLeave(user: UserRow, input: { startDate: string; endDate: string; reason?: string }) {
  if (input.endDate < input.startDate) throw new HttpError(400, "The end date is before the start date");
  const id = randomUUID();
  await db.query(
    `INSERT INTO leave_requests (id, workspace_id, user_id, start_date, end_date, reason) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, user.workspace_id, user.id, input.startDate, input.endDate, input.reason?.trim() || null],
  );
  return { id };
}

export async function listLeave(user: UserRow) {
  const mine = user.role === "employee";
  const rows = await db.query<{
    id: string;
    start_date: string;
    end_date: string;
    reason: string | null;
    status: string;
    person: string;
  }>(
    `SELECT l.id, l.start_date, l.end_date, l.reason, l.status, COALESCE(u.name, e.name, u.phone) AS person
     FROM leave_requests l
     JOIN users u ON u.id = l.user_id
     LEFT JOIN employees e ON e.user_id = u.id AND e.workspace_id = l.workspace_id
     WHERE l.workspace_id = $1 AND ($2 = 'all' OR l.user_id = $2)
     ORDER BY l.created_at DESC`,
    [user.workspace_id, mine ? user.id : "all"],
  );
  return rows.rows.map((row) => ({
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    reason: row.reason,
    status: row.status,
    person: row.person,
  }));
}

export async function decideLeave(workspaceId: string, id: string, status: "approved" | "rejected") {
  const rows = await db.query<{ id: string }>(
    `UPDATE leave_requests SET status = $3 WHERE id = $1 AND workspace_id = $2 AND status = 'pending' RETURNING id`,
    [id, workspaceId, status],
  );
  if (!rows.rows[0]) throw new HttpError(404, "Leave request not found");
  return { id, status };
}

export async function attendanceCsv(workspaceId: string) {
  const rows = await listAttendance(workspaceId);
  const header = "person,phone,site,distance_m,late,checked_in_at";
  const lines = rows.map((row) =>
    [row.person, row.phone, row.site ?? "", row.distance_m ?? "", row.late ? "yes" : "no", row.checked_in_at]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(","),
  );
  return [header, ...lines].join("\n");
}
