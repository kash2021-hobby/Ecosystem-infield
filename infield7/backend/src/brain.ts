import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db, withTransaction, type UserRow } from "./db.js";
import { HttpError, loadWorkspace } from "./auth.js";
import { BRIEF_CREDITS, chargeCredits } from "./billing.js";
import { createTask } from "./field.js";

const uploadsDir = path.join(process.cwd(), "data", "uploads");

function weekStart(timeZone: string) {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const date = new Date(`${iso}T12:00:00Z`);
  const day = date.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setUTCDate(date.getUTCDate() - diff);
  return date.toISOString().slice(0, 10);
}

function cite(policies: { name: string; body: string }[], words: string[]) {
  const match = policies.find((policy) => {
    const haystack = `${policy.name} ${policy.body}`.toLowerCase();
    return words.some((word) => haystack.includes(word));
  });
  return match ? match.name : "This week's attendance and alerts";
}

export async function listKnowledge(workspaceId: string) {
  const policies = await db.query<{ id: string; name: string; body: string }>(
    `SELECT id, name, body FROM policies WHERE workspace_id = $1 ORDER BY created_at ASC`,
    [workspaceId],
  );
  const documents = await db.query<{ id: string; name: string; body: string }>(
    `SELECT id, name, body FROM documents WHERE workspace_id = $1 ORDER BY created_at ASC`,
    [workspaceId],
  );
  const retention = await db.query<{ days: number }>(
    `SELECT days FROM retention_settings WHERE workspace_id = $1`,
    [workspaceId],
  );
  return {
    policies: policies.rows,
    documents: documents.rows,
    retentionDays: retention.rows[0]?.days ?? 90,
  };
}

export async function addPolicy(workspaceId: string, name: string, body: string) {
  const id = randomUUID();
  await db.query(`INSERT INTO policies (id, workspace_id, name, body) VALUES ($1, $2, $3, $4)`, [
    id,
    workspaceId,
    name.trim(),
    body.trim(),
  ]);
  return { id };
}

export async function addDocument(workspaceId: string, name: string, body: string) {
  if (body.length > 20_000) throw new HttpError(400, "Document is too long");
  const id = randomUUID();
  await db.query(`INSERT INTO documents (id, workspace_id, name, body) VALUES ($1, $2, $3, $4)`, [
    id,
    workspaceId,
    name.trim(),
    body.trim(),
  ]);
  return { id };
}

export async function saveRetention(workspaceId: string, days: number) {
  if (days < 7 || days > 3650) throw new HttpError(400, "Keep location history between 7 and 3650 days");
  await db.query(
    `INSERT INTO retention_settings (workspace_id, days) VALUES ($1, $2)
     ON CONFLICT (workspace_id) DO UPDATE SET days = $2`,
    [workspaceId, days],
  );
  const removed = await applyRetention(workspaceId, days);
  return { days, removed };
}

export async function applyRetention(workspaceId: string, days: number) {
  const old = await db.query<{ id: string; selfie_path: string | null }>(
    `SELECT id, selfie_path FROM checkins
     WHERE workspace_id = $1 AND checked_in_at < now() - make_interval(days => $2::int)`,
    [workspaceId, days],
  );
  for (const row of old.rows) {
    if (row.selfie_path) {
      fs.rmSync(path.join(uploadsDir, row.selfie_path), { force: true });
    }
  }
  if (old.rows.length > 0) {
    await db.query(
      `DELETE FROM checkins WHERE workspace_id = $1 AND checked_in_at < now() - make_interval(days => $2::int)`,
      [workspaceId, days],
    );
  }
  return old.rows.length;
}

async function buildItems(workspaceId: string) {
  const policies = await db.query<{ name: string; body: string }>(
    `SELECT name, body FROM policies WHERE workspace_id = $1`,
    [workspaceId],
  );
  const late = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM checkins
     WHERE workspace_id = $1 AND late = true AND checked_in_at > now() - interval '7 days'`,
    [workspaceId],
  );
  const alerts = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM alerts
     WHERE workspace_id = $1 AND status IN ('open', 'escalated') AND created_at > now() - interval '7 days'`,
    [workspaceId],
  );
  const lateCount = Number(late.rows[0]?.n ?? 0);
  const alertCount = Number(alerts.rows[0]?.n ?? 0);
  const items: { title: string; narrative: string; citationLabel: string; suggestionTitle: string | null }[] = [];
  if (lateCount > 0) {
    items.push({
      title: "Late check-ins this week",
      narrative: `${lateCount} check-in${lateCount === 1 ? "" : "s"} landed after the shift grace period.`,
      citationLabel: cite(policies.rows, ["late", "check-in", "9:30", "shift"]),
      suggestionTitle: "Review late arrivals",
    });
  }
  if (alertCount > 0) {
    items.push({
      title: "Alerts still open",
      narrative: `${alertCount} alert${alertCount === 1 ? " is" : "s are"} still open or escalated.`,
      citationLabel: cite(policies.rows, ["sos", "geofence", "alert", "exit"]),
      suggestionTitle: "Follow up open alerts",
    });
  }
  if (items.length === 0) {
    items.push({
      title: "Quiet week",
      narrative: "No late check-ins and no open alerts in the last 7 days.",
      citationLabel: "This week's attendance and alerts",
      suggestionTitle: null,
    });
  }
  return items;
}

function publicItem(row: {
  id: string;
  title: string;
  narrative: string;
  citation_label: string;
  suggestion_title: string | null;
  status: string;
  task_id: string | null;
}) {
  return {
    id: row.id,
    title: row.title,
    narrative: row.narrative,
    citation: row.citation_label,
    suggestionTitle: row.suggestion_title,
    status: row.status,
    taskId: row.task_id,
  };
}

export async function getBrief(user: UserRow) {
  const workspace = await loadWorkspace(user.workspace_id);
  const start = weekStart(workspace.timezone);
  const retention = await db.query<{ days: number }>(
    `SELECT days FROM retention_settings WHERE workspace_id = $1`,
    [user.workspace_id],
  );
  await applyRetention(user.workspace_id, retention.rows[0]?.days ?? 90);

  const existing = await db.query<{ id: string }>(
    `SELECT id FROM briefs WHERE workspace_id = $1 AND week_start = $2`,
    [user.workspace_id, start],
  );
  let briefId = existing.rows[0]?.id;
  if (!briefId) {
    const created = await withTransaction(async (query) => {
      const inserted = await query<{ id: string }>(
        `INSERT INTO briefs (id, workspace_id, week_start) VALUES ($1, $2, $3)
         ON CONFLICT (workspace_id, week_start) DO NOTHING
         RETURNING id`,
        [randomUUID(), user.workspace_id, start],
      );
      const id = inserted.rows[0]?.id;
      if (!id) return null;
      await chargeCredits(query, user.workspace_id, BRIEF_CREDITS, "weekly_brief");
      for (const item of await buildItems(user.workspace_id)) {
        await query(
          `INSERT INTO brief_items (id, brief_id, title, narrative, citation_label, suggestion_title)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [randomUUID(), id, item.title, item.narrative, item.citationLabel, item.suggestionTitle],
        );
      }
      return id;
    });
    briefId =
      created ??
      (
        await db.query<{ id: string }>(
          `SELECT id FROM briefs WHERE workspace_id = $1 AND week_start = $2`,
          [user.workspace_id, start],
        )
      ).rows[0]?.id;
    if (!briefId) throw new HttpError(402, "Credits are used up. The weekly brief waits until the plan is renewed.");
  }
  const items = await db.query<{
    id: string;
    title: string;
    narrative: string;
    citation_label: string;
    suggestion_title: string | null;
    status: string;
    task_id: string | null;
  }>(
    `SELECT id, title, narrative, citation_label, suggestion_title, status, task_id
     FROM brief_items WHERE brief_id = $1 ORDER BY created_at ASC`,
    [briefId],
  );
  return { weekStart: start, items: items.rows.map(publicItem) };
}

export async function acceptBriefItem(user: UserRow, itemId: string) {
  const rows = await db.query<{
    id: string;
    suggestion_title: string | null;
    status: string;
    task_id: string | null;
    brief_id: string;
  }>(
    `SELECT i.id, i.suggestion_title, i.status, i.task_id, i.brief_id
     FROM brief_items i
     JOIN briefs b ON b.id = i.brief_id
     WHERE i.id = $1 AND b.workspace_id = $2`,
    [itemId, user.workspace_id],
  );
  const item = rows.rows[0];
  if (!item) throw new HttpError(404, "Brief item not found");
  if (item.status === "dismissed") throw new HttpError(400, "This suggestion was dismissed");
  if (item.task_id) return { id: item.id, taskId: item.task_id, status: "accepted" };
  if (!item.suggestion_title) throw new HttpError(400, "This note has no action to accept");
  const task = await createTask(user.workspace_id, { title: item.suggestion_title });
  await db.query(`UPDATE brief_items SET status = 'accepted', task_id = $2 WHERE id = $1`, [item.id, task.id]);
  return { id: item.id, taskId: task.id, status: "accepted" };
}

export async function dismissBriefItem(user: UserRow, itemId: string) {
  const rows = await db.query<{ id: string }>(
    `UPDATE brief_items i SET status = 'dismissed'
     FROM briefs b
     WHERE i.id = $1 AND b.id = i.brief_id AND b.workspace_id = $2 AND i.status = 'pending'
     RETURNING i.id`,
    [itemId, user.workspace_id],
  );
  if (!rows.rows[0]) throw new HttpError(404, "Brief item not found");
  return { id: itemId, status: "dismissed" };
}
