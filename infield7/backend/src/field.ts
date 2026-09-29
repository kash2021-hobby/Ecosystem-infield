import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, type UserRow } from "./db.js";
import { HttpError, loadWorkspace } from "./auth.js";

const uploadsDir = path.join(process.cwd(), "data", "uploads");

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radius = 6_371_000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(a));
}

type SiteRow = {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  radius_m: number;
};

function publicSite(row: SiteRow) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    radiusM: row.radius_m,
  };
}

export async function listSites(workspaceId: string) {
  const rows = await db.query<SiteRow>(
    `SELECT id, name, address, lat, lng, radius_m FROM sites WHERE workspace_id = $1 ORDER BY created_at ASC`,
    [workspaceId],
  );
  return rows.rows.map(publicSite);
}

export async function createSite(
  workspaceId: string,
  input: { name: string; address?: string; lat: number; lng: number; radiusM?: number },
) {
  const id = randomUUID();
  const radius = input.radiusM ?? 150;
  if (radius < 30 || radius > 5000) throw new HttpError(400, "Radius must be between 30 and 5000 metres");
  await db.query(
    `INSERT INTO sites (id, workspace_id, name, address, lat, lng, radius_m) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, workspaceId, input.name.trim(), input.address?.trim() || null, input.lat, input.lng, radius],
  );
  return { id };
}

export async function updateSiteRadius(workspaceId: string, siteId: string, radiusM: number) {
  const radius = Math.round(radiusM);
  if (radius < 30 || radius > 5000) throw new HttpError(400, "Radius must be between 30 and 5000 metres");
  const rows = await db.query<{ id: string }>(
    `UPDATE sites SET radius_m = $3 WHERE id = $1 AND workspace_id = $2 RETURNING id`,
    [siteId, workspaceId, radius],
  );
  if (!rows.rows[0]) throw new HttpError(404, "Site not found");
  return { id: siteId, radiusM: radius };
}

export async function getConsent(userId: string) {
  const rows = await db.query<{ granted_at: string }>(
    `SELECT granted_at FROM location_consents WHERE user_id = $1`,
    [userId],
  );
  return { granted: Boolean(rows.rows[0]), grantedAt: rows.rows[0]?.granted_at ?? null };
}

export async function grantConsent(user: UserRow) {
  await db.query(
    `INSERT INTO location_consents (user_id, workspace_id) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET granted_at = now()`,
    [user.id, user.workspace_id],
  );
  return getConsent(user.id);
}

function nearestSite(sites: SiteRow[], lat: number, lng: number) {
  let best: { site: SiteRow; distance: number } | null = null;
  for (const site of sites) {
    const distance = distanceMeters(lat, lng, site.lat, site.lng);
    if (!best || distance < best.distance) best = { site, distance };
  }
  return best;
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

function minutesOf(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export async function checkIn(
  user: UserRow,
  input: { clientId: string; lat: number; lng: number; accuracyM: number; selfieBase64?: string; mocked?: boolean },
) {
  const existing = await db.query<{ id: string }>(
    `SELECT id FROM checkins WHERE workspace_id = $1 AND client_id = $2`,
    [user.workspace_id, input.clientId],
  );
  if (existing.rows[0]) return { id: existing.rows[0].id, replayed: true };

  const consent = await getConsent(user.id);
  if (!consent.granted) throw new HttpError(403, "Location consent is required before check-in");
  if (input.mocked) throw new HttpError(400, "This location looks simulated. Check in from the real site.");
  if (input.accuracyM > 80) {
    throw new HttpError(400, "Location is not accurate enough to check in. Wait for a better GPS fix.");
  }

  const sites = await db.query<SiteRow>(
    `SELECT id, name, address, lat, lng, radius_m FROM sites WHERE workspace_id = $1`,
    [user.workspace_id],
  );
  if (sites.rows.length === 0) throw new HttpError(400, "Add a site before anyone can check in");
  const nearest = nearestSite(sites.rows, input.lat, input.lng);
  if (!nearest) throw new HttpError(400, "Add a site before anyone can check in");

  const distance = Math.round(nearest.distance);
  if (distance > nearest.site.radius_m && distance - input.accuracyM <= nearest.site.radius_m) {
    throw new HttpError(409, `Stay at ${nearest.site.name} a moment and try again. The fix is too close to the fence to trust.`);
  }
  if (distance > nearest.site.radius_m) {
    throw new HttpError(400, `You are outside ${nearest.site.name}. ${distance} m away, fence is ${nearest.site.radius_m} m.`);
  }

  const workspace = await loadWorkspace(user.workspace_id);
  const shift = await db.query<{ start_time: string }>(
    `SELECT start_time FROM shifts WHERE workspace_id = $1 LIMIT 1`,
    [user.workspace_id],
  );
  const late = shift.rows[0] ? minutesNow(workspace.timezone) > minutesOf(shift.rows[0].start_time) + 15 : false;

  let selfiePath: string | null = null;
  if (input.selfieBase64) {
    const raw = input.selfieBase64.replace(/^data:image\/\w+;base64,/, "");
    if (raw.length > 500_000) throw new HttpError(400, "Photo is too large");
    fs.mkdirSync(uploadsDir, { recursive: true });
    const filename = `${randomUUID()}.jpg`;
    fs.writeFileSync(path.join(uploadsDir, filename), Buffer.from(raw, "base64"));
    selfiePath = filename;
  }

  const id = randomUUID();
  await db.query(
    `INSERT INTO checkins (id, workspace_id, user_id, site_id, client_id, lat, lng, accuracy_m, distance_m, inside_fence, late, selfie_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $11)`,
    [id, user.workspace_id, user.id, nearest.site.id, input.clientId, input.lat, input.lng, input.accuracyM, distance, late, selfiePath],
  );
  await db.query(
    `INSERT INTO positions (user_id, workspace_id, lat, lng, accuracy_m, site_id, recorded_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (user_id) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, accuracy_m = EXCLUDED.accuracy_m, site_id = EXCLUDED.site_id, recorded_at = now()`,
    [user.id, user.workspace_id, input.lat, input.lng, input.accuracyM, nearest.site.id],
  );
  return { id, replayed: false, site: nearest.site.name, distanceM: distance, late };
}

export async function listAttendance(workspaceId: string) {
  const rows = await db.query<{
    id: string;
    user_id: string;
    person: string;
    phone: string;
    site: string | null;
    lat: number;
    lng: number;
    distance_m: number | null;
    late: boolean;
    checked_in_at: string;
    selfie_path: string | null;
  }>(
    `SELECT c.id, c.user_id, COALESCE(u.name, e.name, u.phone) AS person, u.phone, s.name AS site,
            c.lat, c.lng, c.distance_m, c.late, c.checked_in_at, c.selfie_path
     FROM checkins c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN employees e ON e.user_id = u.id AND e.workspace_id = c.workspace_id
     LEFT JOIN sites s ON s.id = c.site_id
     WHERE c.workspace_id = $1 AND c.checked_in_at::date = CURRENT_DATE
     ORDER BY c.checked_in_at DESC`,
    [workspaceId],
  );
  return rows.rows;
}

function isoDay(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function shiftIsoDay(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function attendanceReport(workspaceId: string, timezone: string, from?: string, to?: string, userId?: string) {
  const end = to ?? isoDay(timezone);
  const start = from ?? shiftIsoDay(end, -6);
  if (start > end) throw new HttpError(400, "The start date is after the end date");
  const span = (Date.parse(end) - Date.parse(start)) / 86_400_000;
  if (span > 366) throw new HttpError(400, "Pick a range of a year or less");
  const rows = await db.query<{
    day: string;
    person: string;
    phone: string;
    site: string | null;
    late: boolean;
    checked_in_at: string;
  }>(
    `SELECT to_char((c.checked_in_at AT TIME ZONE $4)::date, 'YYYY-MM-DD') AS day,
            COALESCE(u.name, e.name, u.phone) AS person, u.phone, s.name AS site, c.late, c.checked_in_at
     FROM checkins c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN employees e ON e.user_id = u.id AND e.workspace_id = c.workspace_id
     LEFT JOIN sites s ON s.id = c.site_id
     WHERE c.workspace_id = $1
       AND (c.checked_in_at AT TIME ZONE $4)::date >= $2::date
       AND (c.checked_in_at AT TIME ZONE $4)::date <= $3::date
       AND ($5::text IS NULL OR c.user_id = $5)
     ORDER BY c.checked_in_at DESC`,
    [workspaceId, start, end, timezone, userId ?? null],
  );
  const grouped = new Map<string, { person: string; phone: string; days: Set<string>; late: number; checkins: number }>();
  for (const row of rows.rows) {
    const current = grouped.get(row.phone) ?? { person: row.person, phone: row.phone, days: new Set<string>(), late: 0, checkins: 0 };
    current.days.add(row.day);
    current.checkins += 1;
    if (row.late) current.late += 1;
    grouped.set(row.phone, current);
  }
  const people = [...grouped.values()]
    .map((person) => ({
      person: person.person,
      phone: person.phone,
      presentDays: person.days.size,
      late: person.late,
      checkins: person.checkins,
    }))
    .sort((a, b) => b.late - a.late || a.person.localeCompare(b.person));
  return {
    from: start,
    to: end,
    totals: {
      people: people.length,
      checkins: rows.rows.length,
      late: rows.rows.filter((row) => row.late).length,
    },
    people,
    rows: rows.rows.map((row) => ({
      day: row.day,
      person: row.person,
      phone: row.phone,
      site: row.site,
      late: row.late,
      checkedInAt: row.checked_in_at,
    })),
  };
}

export async function listPresence(workspaceId: string) {
  const rows = await db.query<{
    user_id: string;
    person: string;
    lat: number;
    lng: number;
    site: string | null;
    recorded_at: string;
  }>(
    `SELECT p.user_id, COALESCE(u.name, e.name, u.phone) AS person, p.lat, p.lng, s.name AS site, p.recorded_at
     FROM positions p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN employees e ON e.user_id = u.id AND e.workspace_id = p.workspace_id
     LEFT JOIN sites s ON s.id = p.site_id
     WHERE p.workspace_id = $1`,
    [workspaceId],
  );
  return rows.rows.map((row) => ({
    userId: row.user_id,
    person: row.person,
    lat: row.lat,
    lng: row.lng,
    site: row.site,
    recordedAt: row.recorded_at,
  }));
}

export async function saveShift(workspaceId: string, startTime: string, endTime: string) {
  const existing = await db.query<{ id: string }>(`SELECT id FROM shifts WHERE workspace_id = $1 LIMIT 1`, [workspaceId]);
  if (existing.rows[0]) {
    await db.query(`UPDATE shifts SET start_time = $2, end_time = $3 WHERE id = $1`, [existing.rows[0].id, startTime, endTime]);
    return { id: existing.rows[0].id, startTime, endTime };
  }
  const id = randomUUID();
  await db.query(
    `INSERT INTO shifts (id, workspace_id, name, start_time, end_time) VALUES ($1, $2, 'Day', $3, $4)`,
    [id, workspaceId, startTime, endTime],
  );
  return { id, startTime, endTime };
}

export async function getShift(workspaceId: string) {
  const rows = await db.query<{ start_time: string; end_time: string }>(
    `SELECT start_time, end_time FROM shifts WHERE workspace_id = $1 LIMIT 1`,
    [workspaceId],
  );
  if (!rows.rows[0]) return null;
  return { startTime: rows.rows[0].start_time, endTime: rows.rows[0].end_time };
}

export async function listTasks(user: UserRow) {
  const onlyMine = user.role === "employee";
  const rows = await db.query<{
    id: string;
    title: string;
    status: string;
    due_on: string | null;
    assignee: string | null;
    assignee_user_id: string | null;
    site: string | null;
    has_photo: boolean;
    workflow_id: string | null;
    workflow_name: string | null;
    created_at: string;
    step_n: number;
    step_total: number;
    step_done: number;
    previous_title: string | null;
    previous_person: string | null;
    last_at: string | null;
  }>(
    `SELECT t.id, t.title, t.status, t.due_on, t.assignee_user_id, t.workflow_id, t.created_at,
            COALESCE(u.name, e.name, u.phone) AS assignee, s.name AS site,
            EXISTS (SELECT 1 FROM task_updates x WHERE x.task_id = t.id AND x.photo_path IS NOT NULL) AS has_photo,
            (SELECT max(x.created_at) FROM task_updates x WHERE x.task_id = t.id) AS last_at,
            w.name AS workflow_name,
            CASE WHEN t.workflow_id IS NULL THEN 0 ELSE (
              SELECT count(*)::int FROM tasks sib
              WHERE sib.workspace_id = t.workspace_id AND sib.workflow_id = t.workflow_id AND sib.created_at <= t.created_at
            ) END AS step_n,
            CASE WHEN t.workflow_id IS NULL THEN 0 ELSE (
              SELECT count(*)::int FROM tasks sib
              WHERE sib.workspace_id = t.workspace_id AND sib.workflow_id = t.workflow_id
            ) END AS step_total,
            CASE WHEN t.workflow_id IS NULL THEN 0 ELSE (
              SELECT count(*)::int FROM tasks sib
              WHERE sib.workspace_id = t.workspace_id AND sib.workflow_id = t.workflow_id AND sib.status = 'done'
            ) END AS step_done,
            prev.title AS previous_title,
            COALESCE(pu.name, pe.name, pu.phone) AS previous_person
     FROM tasks t
     LEFT JOIN users u ON u.id = t.assignee_user_id
     LEFT JOIN employees e ON e.user_id = u.id AND e.workspace_id = t.workspace_id
     LEFT JOIN sites s ON s.id = t.site_id
     LEFT JOIN workflows w ON w.id = t.workflow_id
     LEFT JOIN LATERAL (
       SELECT p.title, p.assignee_user_id
       FROM tasks p
       WHERE t.workflow_id IS NOT NULL
         AND p.workspace_id = t.workspace_id
         AND p.workflow_id = t.workflow_id
         AND p.created_at < t.created_at
       ORDER BY p.created_at DESC
       LIMIT 1
     ) prev ON true
     LEFT JOIN users pu ON pu.id = prev.assignee_user_id
     LEFT JOIN employees pe ON pe.user_id = pu.id AND pe.workspace_id = t.workspace_id
     WHERE t.workspace_id = $1 AND ($2 = 'all' OR t.assignee_user_id = $2)
     ORDER BY t.created_at DESC`,
    [user.workspace_id, onlyMine ? user.id : "all"],
  );
  return rows.rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    dueOn: row.due_on,
    assignee: row.assignee,
    assigneeUserId: row.assignee_user_id,
    site: row.site,
    hasPhoto: row.has_photo,
    workflowId: row.workflow_id,
    workflowName: row.workflow_name,
    createdAt: row.created_at,
    stepN: row.step_n,
    stepTotal: row.step_total,
    stepDone: row.step_done,
    previousTitle: row.previous_title,
    previousPerson: row.previous_person,
    lastAt: row.last_at,
  }));
}

export async function getTask(user: UserRow, taskId: string) {
  const rows = await db.query<{
    id: string;
    title: string;
    status: string;
    due_on: string | null;
    assignee: string | null;
    assignee_user_id: string | null;
    site: string | null;
    has_photo: boolean;
    workflow_id: string | null;
    workflow_name: string | null;
  }>(
    `SELECT t.id, t.title, t.status, t.due_on, t.assignee_user_id, t.workflow_id,
            COALESCE(u.name, e.name, u.phone) AS assignee, s.name AS site,
            EXISTS (SELECT 1 FROM task_updates x WHERE x.task_id = t.id AND x.photo_path IS NOT NULL) AS has_photo,
            w.name AS workflow_name
     FROM tasks t
     LEFT JOIN users u ON u.id = t.assignee_user_id
     LEFT JOIN employees e ON e.user_id = u.id AND e.workspace_id = t.workspace_id
     LEFT JOIN sites s ON s.id = t.site_id
     LEFT JOIN workflows w ON w.id = t.workflow_id
     WHERE t.id = $1 AND t.workspace_id = $2`,
    [taskId, user.workspace_id],
  );
  const task = rows.rows[0];
  if (!task) throw new HttpError(404, "Task not found");
  if (user.role === "employee" && task.assignee_user_id !== user.id) {
    throw new HttpError(403, "You do not have access to this");
  }
  const updates = await db.query<{
    id: string;
    note: string | null;
    has_photo: boolean;
    created_at: string;
    person: string;
  }>(
    `SELECT x.id, x.note, (x.photo_path IS NOT NULL) AS has_photo, x.created_at,
            COALESCE(u.name, e.name, u.phone) AS person
     FROM task_updates x
     JOIN users u ON u.id = x.user_id
     LEFT JOIN employees e ON e.user_id = u.id AND e.workspace_id = $2
     WHERE x.task_id = $1
     ORDER BY x.created_at ASC`,
    [taskId, user.workspace_id],
  );
  let steps: {
    id: string;
    title: string;
    status: string;
    n: number;
    assigneeUserId: string | null;
    assignee: string | null;
    lastAt: string | null;
  }[] = [];
  if (task.workflow_id) {
    const siblings = await db.query<{
      id: string;
      title: string;
      status: string;
      assignee_user_id: string | null;
      assignee: string | null;
      last_at: string | null;
    }>(
      `SELECT t.id, t.title, t.status, t.assignee_user_id,
              COALESCE(u.name, e.name, u.phone) AS assignee,
              (SELECT max(x.created_at) FROM task_updates x WHERE x.task_id = t.id) AS last_at
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assignee_user_id
       LEFT JOIN employees e ON e.user_id = u.id AND e.workspace_id = t.workspace_id
       WHERE t.workspace_id = $1 AND t.workflow_id = $2
       ORDER BY t.created_at ASC`,
      [user.workspace_id, task.workflow_id],
    );
    steps = siblings.rows.map((row, index) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      n: index + 1,
      assigneeUserId: row.assignee_user_id,
      assignee: row.assignee,
      lastAt: row.last_at,
    }));
  }
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    dueOn: task.due_on,
    assignee: task.assignee,
    assigneeUserId: task.assignee_user_id,
    site: task.site,
    hasPhoto: task.has_photo,
    workflowId: task.workflow_id,
    workflowName: task.workflow_name,
    updates: updates.rows.map((row) => ({
      id: row.id,
      note: row.note,
      hasPhoto: row.has_photo,
      createdAt: row.created_at,
      person: row.person,
    })),
    steps,
  };
}

export async function createTask(
  workspaceId: string,
  input: { title: string; assigneeUserId?: string; siteId?: string; dueOn?: string },
) {
  const id = randomUUID();
  await db.query(
    `INSERT INTO tasks (id, workspace_id, title, assignee_user_id, site_id, due_on) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, workspaceId, input.title.trim(), input.assigneeUserId || null, input.siteId || null, input.dueOn || null],
  );
  return { id };
}

function savePhoto(photoBase64: string) {
  const raw = photoBase64.replace(/^data:image\/\w+;base64,/, "");
  if (raw.length > 500_000) throw new HttpError(400, "Photo is too large");
  fs.mkdirSync(uploadsDir, { recursive: true });
  const filename = `${randomUUID()}.jpg`;
  fs.writeFileSync(path.join(uploadsDir, filename), Buffer.from(raw, "base64"));
  return filename;
}

export async function updateTask(
  user: UserRow,
  taskId: string,
  input: { status: "in_progress" | "done"; note?: string; photoBase64?: string },
) {
  const rows = await db.query<{ assignee_user_id: string | null }>(
    `SELECT assignee_user_id FROM tasks WHERE id = $1 AND workspace_id = $2`,
    [taskId, user.workspace_id],
  );
  const task = rows.rows[0];
  if (!task) throw new HttpError(404, "Task not found");
  if (user.role === "employee" && task.assignee_user_id !== user.id) {
    throw new HttpError(403, "You do not have access to this");
  }
  if (input.status === "done" && !input.photoBase64) {
    throw new HttpError(400, "Add a photo before closing the task");
  }
  const photoPath = input.photoBase64 ? savePhoto(input.photoBase64) : null;
  await db.query(`UPDATE tasks SET status = $2 WHERE id = $1`, [taskId, input.status]);
  await db.query(
    `INSERT INTO task_updates (id, task_id, user_id, note, photo_path) VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), taskId, user.id, input.note ?? null, photoPath],
  );
  return { id: taskId, status: input.status, hasPhoto: Boolean(photoPath) };
}

export async function taskPhoto(user: UserRow, taskId: string) {
  const rows = await db.query<{ photo_path: string; assignee_user_id: string | null }>(
    `SELECT u.photo_path, t.assignee_user_id
     FROM task_updates u
     JOIN tasks t ON t.id = u.task_id
     WHERE u.task_id = $1 AND t.workspace_id = $2 AND u.photo_path IS NOT NULL
     ORDER BY u.created_at DESC LIMIT 1`,
    [taskId, user.workspace_id],
  );
  const row = rows.rows[0];
  if (!row) throw new HttpError(404, "No photo for this task");
  if (user.role === "employee" && row.assignee_user_id !== user.id) {
    throw new HttpError(403, "You do not have access to this");
  }
  const file = path.join(uploadsDir, path.basename(row.photo_path));
  if (!fs.existsSync(file)) throw new HttpError(404, "No photo for this task");
  return fs.readFileSync(file);
}
