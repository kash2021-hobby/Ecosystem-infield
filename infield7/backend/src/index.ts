import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { migrate } from "./db.js";
import {
  HttpError,
  addEmployee,
  assertPermission,
  importEmployees,
  listEmployees,
  loadWorkspace,
  publicUser,
  publicWorkspace,
  readSession,
  requestOtp,
  revokeSession,
  saveWorkspace,
  verifyOtp,
} from "./auth.js";
import {
  checkIn,
  createSite,
  createTask,
  getConsent,
  getShift,
  grantConsent,
  attendanceReport,
  listAttendance,
  listPresence,
  listSites,
  listTasks,
  getTask,
  updateSiteRadius,
  saveShift,
  taskPhoto,
  updateTask,
} from "./field.js";
import {
  acknowledgeAlert,
  attendanceCsv,
  decideLeave,
  listAlerts,
  listLeave,
  listWorkflows,
  publishWorkflow,
  raiseLate,
  raiseSos,
  raiseTaskDelay,
  recordPresence,
  requestLeave,
  saveQuietHours,
} from "./rules.js";
import {
  acceptBriefItem,
  addDocument,
  addPolicy,
  dismissBriefItem,
  getBrief,
  listKnowledge,
  saveRetention,
} from "./brain.js";
import { captureRazorpay, confirmStubPayment, getBilling, saveBillingProfile, subscribe } from "./billing.js";

const app = Fastify({ logger: true });
await app.register(cors, {
  origin: true,
  methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"],
});

app.removeContentTypeParser("application/json");
app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
  const text = typeof body === "string" ? body : body.toString();
  (request as FastifyRequest & { rawBody?: string }).rawBody = text;
  try {
    done(null, text ? JSON.parse(text) : {});
  } catch (error) {
    done(error as Error, undefined);
  }
});

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof HttpError) {
    return reply.status(error.status).send({ error: error.message });
  }
  if (error instanceof z.ZodError) {
    return reply.status(400).send({ error: error.issues[0]?.message ?? "Invalid input" });
  }
  app.log.error(error);
  return reply.status(500).send({ error: "Something went wrong" });
});

function bearer(header?: string) {
  if (!header?.startsWith("Bearer ")) throw new HttpError(401, "Sign in again");
  return header.slice("Bearer ".length);
}

app.get("/health", async () => ({ ok: true }));

app.get("/openapi.json", async () => ({
  openapi: "3.0.3",
  info: { title: "InField 7", version: "0.1.0" },
  paths: {
    "/auth/signup": { post: { summary: "Send a one-time code" } },
    "/auth/verify": { post: { summary: "Verify a code and open a session" } },
    "/auth/logout": { post: { summary: "Revoke the current session" } },
    "/me": { get: { summary: "Current user and workspace" } },
    "/workspace": { patch: { summary: "Update the company profile" } },
    "/employees": { get: { summary: "List the roster" }, post: { summary: "Invite an employee" } },
    "/employees/import": { post: { summary: "Import a roster CSV" } },
    "/sites": { get: { summary: "List sites" }, post: { summary: "Create a site and geofence" } },
    "/consent": { get: { summary: "Location consent" }, post: { summary: "Grant location consent" } },
    "/check-ins": { post: { summary: "Check in inside a site fence" } },
    "/attendance": { get: { summary: "Today's check-ins" } },
    "/presence": { get: { summary: "Last known positions" } },
    "/tasks": { get: { summary: "List tasks" }, post: { summary: "Create a task" } },
  },
}));

const phoneBody = z.object({
  phone: z.string().min(8),
  country_code: z.string().default("+91"),
});

app.post("/auth/signup", async (request) => {
  const body = phoneBody.parse(request.body);
  const result = await requestOtp(body.country_code, body.phone);
  return { ok: true, phone: result.phone.phone, devCode: result.devCode };
});

app.post("/auth/verify", async (request) => {
  const body = phoneBody
    .extend({
      code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
      invite_code: z.string().optional(),
    })
    .parse(request.body);
  return verifyOtp({
    countryCode: body.country_code,
    rawPhone: body.phone,
    code: body.code,
    inviteCode: body.invite_code,
  });
});

app.post("/auth/logout", async (request) => {
  const token = bearer(request.headers.authorization);
  const body = z.object({ all_devices: z.boolean().optional() }).parse(request.body ?? {});
  await revokeSession(token, Boolean(body.all_devices));
  return { ok: true };
});

app.get("/me", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  const workspace = await loadWorkspace(user.workspace_id);
  return { user: publicUser(user), workspace: publicWorkspace(workspace) };
});

app.patch("/workspace", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "workspace:write");
  const body = z
    .object({
      name: z.string().min(2, "Business name is required"),
      industry: z.string().optional(),
      businessType: z.string().optional(),
      teamSize: z.string().optional(),
      currency: z.string().optional(),
      timezone: z.string().optional(),
    })
    .parse(request.body);
  return saveWorkspace(user.workspace_id, body);
});

app.get("/employees", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "employees:read");
  return { employees: await listEmployees(user.workspace_id) };
});

app.post("/employees", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "employees:write");
  const body = z
    .object({
      name: z.string().min(2),
      phone: z.string().min(8),
      role: z.enum(["admin", "manager", "employee"]).default("employee"),
      country_code: z.string().optional(),
    })
    .parse(request.body);
  return addEmployee(user.workspace_id, {
    name: body.name,
    phone: body.phone,
    role: body.role,
    countryCode: body.country_code,
  });
});

app.post("/employees/import", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "employees:write");
  const body = z.object({ csv: z.string().min(3) }).parse(request.body);
  return importEmployees(user.workspace_id, body.csv);
});

app.get("/sites", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  return { sites: await listSites(user.workspace_id), shift: await getShift(user.workspace_id) };
});

app.post("/sites", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "sites:write");
  const body = z
    .object({
      name: z.string().min(2),
      address: z.string().optional(),
      lat: z.number().gte(-90).lte(90),
      lng: z.number().gte(-180).lte(180),
      radiusM: z.number().optional(),
    })
    .parse(request.body);
  return createSite(user.workspace_id, body);
});

app.patch("/sites/:id", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "sites:write");
  const params = z.object({ id: z.string().min(1) }).parse(request.params);
  const body = z.object({ radiusM: z.number() }).parse(request.body);
  return updateSiteRadius(user.workspace_id, params.id, body.radiusM);
});

app.post("/shift", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "sites:write");
  const body = z
    .object({
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
    })
    .parse(request.body);
  return saveShift(user.workspace_id, body.startTime, body.endTime);
});

app.get("/consent", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  return getConsent(user.id);
});

app.post("/consent", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  return grantConsent(user);
});

app.post("/check-ins", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "field:checkin");
  const body = z
    .object({
      clientId: z.string().min(8),
      lat: z.number(),
      lng: z.number(),
      accuracyM: z.number().positive(),
      selfieBase64: z.string().optional(),
      mocked: z.boolean().optional(),
    })
    .parse(request.body);
  return checkIn(user, body).then(async (result) => {
    if (result.late && !result.replayed && result.site) await raiseLate(user, result.site);
    return result;
  });
});

app.get("/attendance", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "field:read");
  return { checkins: await listAttendance(user.workspace_id) };
});

app.get("/reports/attendance", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  if (user.role !== "employee") assertPermission(user.role, "field:read");
  const query = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }).parse(request.query);
  const workspace = await loadWorkspace(user.workspace_id);
  return attendanceReport(
    user.workspace_id,
    workspace.timezone,
    query.from,
    query.to,
    user.role === "employee" ? user.id : undefined,
  );
});

app.get("/presence", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "field:read");
  const [people, sites] = await Promise.all([listPresence(user.workspace_id), listSites(user.workspace_id)]);
  return { people, sites };
});

app.get("/tasks", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  return { tasks: await listTasks(user) };
});

app.post("/tasks", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "tasks:write");
  const body = z
    .object({
      title: z.string().min(2),
      assigneeUserId: z.string().optional(),
      siteId: z.string().optional(),
      dueOn: z.string().optional(),
    })
    .parse(request.body);
  return createTask(user.workspace_id, body);
});

app.post("/tasks/:id", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z
    .object({
      status: z.enum(["in_progress", "done"]),
      note: z.string().optional(),
      photoBase64: z.string().optional(),
    })
    .parse(request.body);
  return updateTask(user, params.id, body);
});

app.get("/tasks/:id", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  const params = z.object({ id: z.string() }).parse(request.params);
  return getTask(user, params.id);
});

app.post("/tasks/:id/delay", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({
    reason: z.string().min(2),
    detail: z.string().optional(),
  }).parse(request.body);
  return raiseTaskDelay(user, params.id, body.reason, body.detail);
});

app.get("/tasks/:id/photo", async (request, reply) => {
  const user = await readSession(bearer(request.headers.authorization));
  const params = z.object({ id: z.string() }).parse(request.params);
  return reply.type("image/jpeg").send(await taskPhoto(user, params.id));
});

app.get("/attendance.csv", async (request, reply) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "field:read");
  return reply.type("text/csv").send(await attendanceCsv(user.workspace_id));
});

app.get("/alerts", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "alerts:read");
  return listAlerts(user.workspace_id);
});

app.post("/alerts/:id/acknowledge", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "alerts:read");
  const params = z.object({ id: z.string() }).parse(request.params);
  return acknowledgeAlert(user.workspace_id, params.id);
});

app.post("/quiet-hours", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "alerts:read");
  const body = z.object({
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
  }).parse(request.body);
  return saveQuietHours(user.workspace_id, body.startTime, body.endTime);
});

app.post("/sos", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "field:checkin");
  return raiseSos(user);
});

app.post("/presence", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "field:checkin");
  const body = z.object({
    lat: z.number(),
    lng: z.number(),
    accuracyM: z.number().positive(),
  }).parse(request.body);
  return recordPresence(user, body.lat, body.lng, body.accuracyM);
});

app.get("/workflows", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  return { workflows: await listWorkflows(user.workspace_id) };
});

app.post("/workflows", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "workflows:write");
  const body = z.object({
    name: z.string().min(2),
    steps: z.array(z.string()).min(1),
    assigneeUserId: z.string().optional(),
  }).parse(request.body);
  return publishWorkflow(user.workspace_id, body);
});

app.get("/leave", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  return { requests: await listLeave(user) };
});

app.post("/leave", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  const body = z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().optional(),
  }).parse(request.body);
  return requestLeave(user, body);
});

app.post("/leave/:id", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "leave:decide");
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ status: z.enum(["approved", "rejected"]) }).parse(request.body);
  return decideLeave(user.workspace_id, params.id, body.status);
});

app.get("/brain", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "brain:write");
  return listKnowledge(user.workspace_id);
});

app.post("/policies", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "brain:write");
  const body = z.object({ name: z.string().min(2), body: z.string().min(2) }).parse(request.body);
  return addPolicy(user.workspace_id, body.name, body.body);
});

app.post("/documents", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "brain:write");
  const body = z.object({ name: z.string().min(2), body: z.string().min(2) }).parse(request.body);
  return addDocument(user.workspace_id, body.name, body.body);
});

app.post("/retention", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "brain:write");
  const body = z.object({ days: z.number().int() }).parse(request.body);
  return saveRetention(user.workspace_id, body.days);
});

app.get("/brief", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "brain:write");
  return getBrief(user);
});

app.post("/brief/:id/accept", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "tasks:write");
  const params = z.object({ id: z.string() }).parse(request.params);
  return acceptBriefItem(user, params.id);
});

app.post("/brief/:id/dismiss", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "brain:write");
  const params = z.object({ id: z.string() }).parse(request.params);
  return dismissBriefItem(user, params.id);
});

app.get("/billing", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "billing:write");
  const workspace = await loadWorkspace(user.workspace_id);
  return getBilling(user.workspace_id, workspace.name);
});

app.post("/billing/profile", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "billing:write");
  const body = z.object({
    legalName: z.string().min(2),
    gstin: z.string().optional(),
    stateCode: z.string().regex(/^\d{2}$/),
  }).parse(request.body);
  return saveBillingProfile(user.workspace_id, body);
});

app.post("/billing/subscribe", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "billing:write");
  const workspace = await loadWorkspace(user.workspace_id);
  return subscribe(user.workspace_id, workspace.name);
});

app.post("/billing/confirm", async (request) => {
  const user = await readSession(bearer(request.headers.authorization));
  assertPermission(user.role, "billing:write");
  const body = z.object({ paymentId: z.string().uuid() }).parse(request.body);
  return confirmStubPayment(user.workspace_id, body.paymentId);
});

app.post("/billing/razorpay", async (request) => {
  const signature = request.headers["x-razorpay-signature"];
  const raw = (request as FastifyRequest & { rawBody?: string }).rawBody ?? "";
  return captureRazorpay(raw, typeof signature === "string" ? signature : undefined);
});

await migrate();
const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });
