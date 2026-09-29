import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required, for example postgres://infield7:password@127.0.0.1:5432/infield7");
}

const pool = new pg.Pool({ connectionString });

export type Query = <T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
) => Promise<pg.QueryResult<T>>;

export const db = {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]) {
    return pool.query<T>(text, params as unknown[]);
  },
};

export async function withTransaction<T>(run: (query: Query) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const query: Query = (text, params) => client.query(text, params as unknown[]);
  try {
    await client.query("BEGIN");
    const result = await run(query);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const statements = [
  `CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    industry TEXT,
    business_type TEXT,
    team_size TEXT,
    currency TEXT NOT NULL DEFAULT 'INR',
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    phone TEXT NOT NULL UNIQUE,
    country_code TEXT NOT NULL DEFAULT '+91',
    role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'employee')),
    name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS otps (
    id TEXT PRIMARY KEY,
    phone TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    attempts INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    user_id TEXT REFERENCES users(id),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'manager', 'employee')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
    invite_code TEXT,
    invite_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS otps_phone_created ON otps (phone, created_at)`,
  `CREATE INDEX IF NOT EXISTS employees_workspace ON employees (workspace_id)`,
  `CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    name TEXT NOT NULL,
    address TEXT,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    radius_m INT NOT NULL DEFAULT 150,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS shifts (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS location_consents (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS checkins (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    site_id TEXT REFERENCES sites(id),
    client_id TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    accuracy_m DOUBLE PRECISION NOT NULL,
    distance_m INT,
    inside_fence BOOLEAN NOT NULL,
    late BOOLEAN NOT NULL DEFAULT false,
    selfie_path TEXT,
    checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, client_id)
  )`,
  `CREATE TABLE IF NOT EXISTS positions (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    accuracy_m DOUBLE PRECISION NOT NULL,
    site_id TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    title TEXT NOT NULL,
    assignee_user_id TEXT REFERENCES users(id),
    site_id TEXT REFERENCES sites(id),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'done')),
    due_on TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS workflow_id TEXT`,
  `CREATE TABLE IF NOT EXISTS alert_rules (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    kind TEXT NOT NULL CHECK (kind IN ('late_checkin', 'geofence_exit', 'sos', 'task_delay')),
    enabled BOOLEAN NOT NULL DEFAULT true,
    escalate_after_min INT NOT NULL DEFAULT 15,
    UNIQUE (workspace_id, kind)
  )`,
  `CREATE TABLE IF NOT EXISTS quiet_hours (
    workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),
    start_time TEXT NOT NULL DEFAULT '22:00',
    end_time TEXT NOT NULL DEFAULT '07:00'
  )`,
  `CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    user_id TEXT REFERENCES users(id),
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'held', 'acknowledged', 'escalated')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    name TEXT NOT NULL,
    assignee_user_id TEXT REFERENCES users(id),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS workflow_steps (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id),
    position INT NOT NULL,
    title TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS leave_requests (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS task_updates (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE task_updates ADD COLUMN IF NOT EXISTS photo_path TEXT`,
  `CREATE TABLE IF NOT EXISTS policies (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    name TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    name TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS retention_settings (
    workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),
    days INT NOT NULL DEFAULT 90
  )`,
  `CREATE TABLE IF NOT EXISTS briefs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    week_start TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, week_start)
  )`,
  `CREATE TABLE IF NOT EXISTS brief_items (
    id TEXT PRIMARY KEY,
    brief_id TEXT NOT NULL REFERENCES briefs(id),
    title TEXT NOT NULL,
    narrative TEXT NOT NULL,
    citation_label TEXT NOT NULL,
    suggestion_title TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
    task_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS billing_profiles (
    workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),
    legal_name TEXT NOT NULL DEFAULT '',
    gstin TEXT,
    state_code TEXT NOT NULL DEFAULT '29',
    state_name TEXT NOT NULL DEFAULT 'Karnataka'
  )`,
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    plan_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'active')),
    provider TEXT NOT NULL,
    provider_ref TEXT,
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
    status TEXT NOT NULL CHECK (status IN ('pending', 'captured')),
    amount_paise INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS credit_balances (
    workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),
    balance INT NOT NULL,
    monthly_credits INT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS credit_ledger (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    delta INT NOT NULL,
    reason TEXT NOT NULL,
    balance_after INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    payment_id TEXT NOT NULL UNIQUE REFERENCES payments(id),
    number TEXT NOT NULL UNIQUE,
    taxable_paise INT NOT NULL,
    cgst_paise INT NOT NULL,
    sgst_paise INT NOT NULL,
    igst_paise INT NOT NULL,
    total_paise INT NOT NULL,
    buyer_name TEXT NOT NULL,
    buyer_gstin TEXT,
    buyer_state TEXT NOT NULL,
    seller_name TEXT NOT NULL,
    seller_gstin TEXT,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_kind_check`,
  `ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS alert_rules_kind_check`,
  `ALTER TABLE alerts ADD CONSTRAINT alerts_kind_check CHECK (kind IN ('late_checkin', 'geofence_exit', 'sos', 'task_delay'))`,
  `ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_kind_check CHECK (kind IN ('late_checkin', 'geofence_exit', 'sos', 'task_delay'))`,
];

export async function migrate() {
  for (const statement of statements) {
    await db.query(statement);
  }
}

export type Role = "admin" | "manager" | "employee";

export type UserRow = {
  id: string;
  workspace_id: string;
  phone: string;
  country_code: string;
  role: Role;
  name: string | null;
};

export type WorkspaceRow = {
  id: string;
  name: string;
  industry: string | null;
  business_type: string | null;
  team_size: string | null;
  currency: string;
  timezone: string;
};
