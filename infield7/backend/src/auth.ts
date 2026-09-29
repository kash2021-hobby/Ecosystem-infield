import { randomInt, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { db, type Role, type UserRow, type WorkspaceRow } from "./db.js";
import { checkCode, deliverOtp, hashCode, isStubSms } from "./sms.js";

const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "infield7-dev-secret-change-me");

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function normalizePhone(countryCode: string, rawPhone: string) {
  const cc = (countryCode || "+91").replace(/\D/g, "") || "91";
  let digits = rawPhone.replace(/\D/g, "");
  if (digits.startsWith(cc) && digits.length > 10) digits = digits.slice(cc.length);
  if (digits.length < 8 || digits.length > 12) {
    throw new HttpError(400, "Enter a valid phone number");
  }
  return { countryCode: `+${cc}`, phone: digits, e164: `+${cc}${digits}` };
}

function sixDigit() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function inviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[randomInt(0, alphabet.length)]).join("");
}

export async function requestOtp(countryCode: string, rawPhone: string) {
  const phone = normalizePhone(countryCode, rawPhone);
  const recent = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM otps WHERE phone = $1 AND created_at > now() - interval '15 minutes'`,
    [phone.phone],
  );
  if (Number(recent.rows[0]?.n ?? 0) >= 3) {
    throw new HttpError(429, "Too many codes. Wait 15 minutes and try again.");
  }
  const code = sixDigit();
  await db.query(
    `INSERT INTO otps (id, phone, code_hash, expires_at) VALUES ($1, $2, $3, now() + interval '10 minutes')`,
    [randomUUID(), phone.phone, await hashCode(code)],
  );
  await deliverOtp(phone.e164, code);
  return { phone, devCode: isStubSms() ? code : undefined };
}

export async function verifyOtp(input: {
  countryCode: string;
  rawPhone: string;
  code: string;
  inviteCode?: string;
}) {
  const phone = normalizePhone(input.countryCode, input.rawPhone);
  const otp = await db.query<{ id: string; code_hash: string; attempts: number }>(
    `SELECT id, code_hash, attempts FROM otps
     WHERE phone = $1 AND consumed_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [phone.phone],
  );
  const row = otp.rows[0];
  if (!row) throw new HttpError(400, "Code expired or invalid");
  if (row.attempts >= 5) {
    await db.query(`UPDATE otps SET consumed_at = now() WHERE id = $1`, [row.id]);
    throw new HttpError(400, "Code expired or invalid");
  }
  const ok = await checkCode(input.code, row.code_hash);
  if (!ok) {
    await db.query(`UPDATE otps SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
    throw new HttpError(400, "Code expired or invalid");
  }
  await db.query(`UPDATE otps SET consumed_at = now() WHERE id = $1`, [row.id]);

  const existing = await db.query<UserRow>(`SELECT * FROM users WHERE phone = $1`, [phone.phone]);
  let user = existing.rows[0];
  if (!user) user = await activateOrCreate(phone, input.inviteCode);
  const session = await issueSession(user);
  const workspace = await loadWorkspace(user.workspace_id);
  return { token: session, user: publicUser(user), workspace: publicWorkspace(workspace) };
}

async function activateOrCreate(
  phone: { countryCode: string; phone: string },
  inviteCodeInput?: string,
) {
  const invite = inviteCodeInput?.trim().toUpperCase();
  const pending = await db.query<{
    id: string;
    workspace_id: string;
    name: string;
    role: Role;
    invite_code: string | null;
    invite_expires_at: string | null;
  }>(
    `SELECT id, workspace_id, name, role, invite_code, invite_expires_at
     FROM employees WHERE phone = $1 AND status = 'pending'`,
    [phone.phone],
  );

  let match = pending.rows[0];
  if (invite) {
    match = pending.rows.find((row) => row.invite_code === invite);
    if (!match) throw new HttpError(400, "Invite code is not valid. Contact your admin.");
    if (match.invite_expires_at && new Date(match.invite_expires_at).getTime() < Date.now()) {
      throw new HttpError(400, "Invite code has expired. Contact your admin.");
    }
  } else if (pending.rows.length > 1) {
    throw new HttpError(400, "Enter the invite code from your admin.");
  } else if (!match) {
    return createAdminWorkspace(phone);
  }

  const userId = randomUUID();
  await db.query(
    `INSERT INTO users (id, workspace_id, phone, country_code, role, name) VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, match.workspace_id, phone.phone, phone.countryCode, match.role, match.name],
  );
  await db.query(
    `UPDATE employees SET status = 'active', user_id = $1, invite_code = NULL, invite_expires_at = NULL WHERE id = $2`,
    [userId, match.id],
  );
  const created = await db.query<UserRow>(`SELECT * FROM users WHERE id = $1`, [userId]);
  return created.rows[0];
}

async function createAdminWorkspace(phone: { countryCode: string; phone: string }) {
  const workspaceId = randomUUID();
  const userId = randomUUID();
  await db.query(`INSERT INTO workspaces (id) VALUES ($1)`, [workspaceId]);
  await db.query(
    `INSERT INTO users (id, workspace_id, phone, country_code, role, name) VALUES ($1, $2, $3, $4, 'admin', NULL)`,
    [userId, workspaceId, phone.phone, phone.countryCode],
  );
  await db.query(
    `INSERT INTO employees (id, workspace_id, user_id, name, phone, role, status) VALUES ($1, $2, $3, 'Admin', $4, 'admin', 'active')`,
    [randomUUID(), workspaceId, userId, phone.phone],
  );
  const created = await db.query<UserRow>(`SELECT * FROM users WHERE id = $1`, [userId]);
  return created.rows[0];
}

async function issueSession(user: UserRow) {
  const sid = randomUUID();
  await db.query(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '30 days')`,
    [sid, user.id],
  );
  return new SignJWT({ sid, role: user.role, workspaceId: user.workspace_id })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret);
}

export async function readSession(token: string) {
  let payload: { sub?: string; sid?: string };
  try {
    payload = (await jwtVerify(token, secret)).payload as { sub?: string; sid?: string };
  } catch {
    throw new HttpError(401, "Sign in again");
  }
  if (!payload.sub || !payload.sid) throw new HttpError(401, "Sign in again");
  const session = await db.query<{ id: string }>(
    `SELECT id FROM sessions WHERE id = $1 AND user_id = $2 AND expires_at > now()`,
    [payload.sid, payload.sub],
  );
  if (!session.rows[0]) throw new HttpError(401, "Sign in again");
  const users = await db.query<UserRow>(`SELECT * FROM users WHERE id = $1`, [payload.sub]);
  const user = users.rows[0];
  if (!user) throw new HttpError(401, "Sign in again");
  return user;
}

export async function revokeSession(token: string, allDevices: boolean) {
  const user = await readSession(token);
  if (allDevices) {
    await db.query(`DELETE FROM sessions WHERE user_id = $1`, [user.id]);
    return;
  }
  const payload = (await jwtVerify(token, secret)).payload as { sid?: string };
  if (payload.sid) await db.query(`DELETE FROM sessions WHERE id = $1`, [payload.sid]);
}

export async function loadWorkspace(id: string) {
  const rows = await db.query<WorkspaceRow>(`SELECT * FROM workspaces WHERE id = $1`, [id]);
  if (!rows.rows[0]) throw new HttpError(404, "Workspace not found");
  return rows.rows[0];
}

export function publicUser(user: UserRow) {
  return {
    id: user.id,
    phone: user.phone,
    countryCode: user.country_code,
    role: user.role,
    name: user.name,
    workspaceId: user.workspace_id,
  };
}

export function publicWorkspace(workspace: WorkspaceRow) {
  return {
    id: workspace.id,
    name: workspace.name,
    industry: workspace.industry,
    businessType: workspace.business_type,
    teamSize: workspace.team_size,
    currency: workspace.currency,
    timezone: workspace.timezone,
  };
}

const permissions: Record<Role, string[]> = {
  admin: ["workspace:write", "employees:write", "employees:read", "sites:write", "tasks:write", "field:read", "field:checkin", "alerts:read", "workflows:write", "leave:decide", "brain:write", "billing:write"],
  manager: ["employees:read", "sites:write", "tasks:write", "field:read", "field:checkin", "alerts:read", "workflows:write", "leave:decide", "brain:write"],
  employee: ["field:checkin"],
};

export function assertPermission(role: Role, permission: string) {
  if (!permissions[role].includes(permission)) {
    throw new HttpError(403, "You do not have access to this");
  }
}

export async function saveWorkspace(
  workspaceId: string,
  input: {
    name: string;
    industry?: string;
    businessType?: string;
    teamSize?: string;
    currency?: string;
    timezone?: string;
  },
) {
  await db.query(
    `UPDATE workspaces SET name = $2, industry = $3, business_type = $4, team_size = $5, currency = $6, timezone = $7 WHERE id = $1`,
    [
      workspaceId,
      input.name.trim(),
      input.industry ?? null,
      input.businessType ?? null,
      input.teamSize ?? null,
      input.currency ?? "INR",
      input.timezone ?? "Asia/Kolkata",
    ],
  );
  return publicWorkspace(await loadWorkspace(workspaceId));
}

export async function listEmployees(workspaceId: string) {
  const rows = await db.query<{
    id: string;
    name: string;
    phone: string;
    role: Role;
    status: string;
    invite_code: string | null;
    invite_expires_at: string | null;
    user_id: string | null;
  }>(
    `SELECT id, name, phone, role, status, invite_code, invite_expires_at, user_id
     FROM employees WHERE workspace_id = $1 ORDER BY created_at ASC`,
    [workspaceId],
  );
  return rows.rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    role: row.role,
    status: row.status,
    inviteCode: row.invite_code,
    inviteExpiresAt: row.invite_expires_at,
    userId: row.user_id,
  }));
}

export async function addEmployee(
  workspaceId: string,
  input: { name: string; phone: string; role: Role; countryCode?: string },
) {
  const phone = normalizePhone(input.countryCode ?? "+91", input.phone);
  const taken = await db.query(
    `SELECT id FROM employees WHERE workspace_id = $1 AND phone = $2`,
    [workspaceId, phone.phone],
  );
  if (taken.rows[0]) throw new HttpError(400, "That phone is already on the roster");
  const code = inviteCode();
  const id = randomUUID();
  await db.query(
    `INSERT INTO employees (id, workspace_id, name, phone, role, status, invite_code, invite_expires_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6, now() + interval '7 days')`,
    [id, workspaceId, input.name.trim(), phone.phone, input.role, code],
  );
  return { id, inviteCode: code, phone: phone.phone };
}

export async function importEmployees(workspaceId: string, csv: string) {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const start = lines[0]?.toLowerCase().startsWith("name") ? 1 : 0;
  const created: { name: string; phone: string; inviteCode: string }[] = [];
  const errors: { line: number; message: string }[] = [];
  for (let i = start; i < lines.length; i += 1) {
    const [name, phone, roleRaw] = lines[i].split(",").map((part) => part.trim());
    const role = (roleRaw || "employee").toLowerCase();
    if (!name || !phone) {
      errors.push({ line: i + 1, message: "Name and phone are required" });
      continue;
    }
    if (role !== "admin" && role !== "manager" && role !== "employee") {
      errors.push({ line: i + 1, message: "Role must be admin, manager, or employee" });
      continue;
    }
    try {
      const row = await addEmployee(workspaceId, { name, phone, role });
      created.push({ name, phone: row.phone, inviteCode: row.inviteCode });
    } catch (error) {
      errors.push({ line: i + 1, message: error instanceof Error ? error.message : "Could not add" });
    }
  }
  return { created, errors };
}
