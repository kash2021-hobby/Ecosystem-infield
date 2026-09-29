import { createHmac, randomUUID } from "node:crypto";
import { db, withTransaction, type Query } from "./db.js";
import { HttpError } from "./auth.js";

/** Rate card from the pricing reference. Only Basic is sold in this phase. */
export const RATE_CARD = [
  { id: "basic", name: "Basic", multiplier: 1, usdPerThousand: 8, purchasable: true },
  { id: "premium", name: "Premium", multiplier: 3, usdPerThousand: 22, purchasable: false },
  { id: "ultra", name: "Ultra", multiplier: 8, usdPerThousand: 60, purchasable: false },
] as const;

export const PLAN = RATE_CARD[0];
/** Generated report, 1 page, from the credits explainer. Basic multiplies by 1. */
export const BRIEF_CREDITS = 12 * PLAN.multiplier;
export const MONTHLY_CREDITS = 1000;
export const ROLLOVER_MULTIPLE = 2;
/** Invoices are INR. The design price is US dollars. */
export const INR_PER_USD = 84;

export const STATES: { code: string; name: string }[] = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
];

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function seller() {
  return {
    name: process.env.INFIELD_LEGAL_NAME ?? "InField 7",
    gstin: process.env.INFIELD_GSTIN ?? null,
    stateCode: process.env.INFIELD_STATE_CODE ?? "29",
  };
}

export function quoteFor(stateCode: string) {
  const taxablePaise = PLAN.usdPerThousand * INR_PER_USD * 100;
  const sameState = stateCode === seller().stateCode;
  const cgstPaise = sameState ? Math.round((taxablePaise * 9) / 100) : 0;
  const sgstPaise = sameState ? Math.round((taxablePaise * 9) / 100) : 0;
  const igstPaise = sameState ? 0 : Math.round((taxablePaise * 18) / 100);
  return {
    taxablePaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    totalPaise: taxablePaise + cgstPaise + sgstPaise + igstPaise,
    sameState,
  };
}

function stateByCode(code: string) {
  const found = STATES.find((state) => state.code === code);
  if (!found) throw new HttpError(400, "Choose a state");
  return found;
}

function paymentMode() {
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_PLAN_ID) {
    return "razorpay" as const;
  }
  return "stub" as const;
}

type Profile = { legal_name: string; gstin: string | null; state_code: string; state_name: string };

async function profileFor(workspaceId: string, fallbackName: string): Promise<Profile> {
  const rows = await db.query<Profile>(
    `SELECT legal_name, gstin, state_code, state_name FROM billing_profiles WHERE workspace_id = $1`,
    [workspaceId],
  );
  return (
    rows.rows[0] ?? {
      legal_name: fallbackName,
      gstin: null,
      state_code: "29",
      state_name: "Karnataka",
    }
  );
}

export async function chargeCredits(query: Query, workspaceId: string, amount: number, reason: string) {
  const updated = await query<{ balance: number }>(
    `UPDATE credit_balances SET balance = balance - $2
     WHERE workspace_id = $1 AND balance >= $2
     RETURNING balance`,
    [workspaceId, amount],
  );
  const balance = updated.rows[0]?.balance;
  if (balance === undefined) {
    throw new HttpError(402, "Credits are used up. The weekly brief waits until the plan is renewed.");
  }
  await query(
    `INSERT INTO credit_ledger (id, workspace_id, delta, reason, balance_after) VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), workspaceId, -amount, reason, balance],
  );
  return balance;
}

export async function getBilling(workspaceId: string, workspaceName: string) {
  const profile = await profileFor(workspaceId, workspaceName);
  const balance = await db.query<{ balance: number; monthly_credits: number }>(
    `SELECT balance, monthly_credits FROM credit_balances WHERE workspace_id = $1`,
    [workspaceId],
  );
  const subscription = await db.query<{ status: string; current_period_end: string | null }>(
    `SELECT status, current_period_end FROM subscriptions
     WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [workspaceId],
  );
  const pending = await db.query<{ id: string }>(
    `SELECT id FROM payments WHERE workspace_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
    [workspaceId],
  );
  const invoices = await db.query<{
    id: string;
    number: string;
    taxable_paise: number;
    cgst_paise: number;
    sgst_paise: number;
    igst_paise: number;
    total_paise: number;
    buyer_name: string;
    buyer_gstin: string | null;
    buyer_state: string;
    seller_name: string;
    seller_gstin: string | null;
    issued_at: string;
  }>(
    `SELECT id, number, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise,
            buyer_name, buyer_gstin, buyer_state, seller_name, seller_gstin, issued_at
     FROM invoices WHERE workspace_id = $1 ORDER BY issued_at DESC`,
    [workspaceId],
  );
  const held = balance.rows[0];
  return {
    plan: {
      id: PLAN.id,
      name: PLAN.name,
      monthlyCredits: MONTHLY_CREDITS,
      multiplier: PLAN.multiplier,
      usdPerThousand: PLAN.usdPerThousand,
      briefCredits: BRIEF_CREDITS,
      rolloverMultiple: ROLLOVER_MULTIPLE,
      inrPerUsd: INR_PER_USD,
    },
    rateCard: RATE_CARD.map((tier) => ({
      id: tier.id,
      name: tier.name,
      multiplier: tier.multiplier,
      usdPerThousand: tier.usdPerThousand,
      briefCredits: 12 * tier.multiplier,
      purchasable: tier.purchasable,
    })),
    quote: quoteFor(profile.state_code),
    balance: held?.balance ?? 0,
    monthlyCredits: held?.monthly_credits ?? MONTHLY_CREDITS,
    cap: MONTHLY_CREDITS * ROLLOVER_MULTIPLE,
    profile: {
      legalName: profile.legal_name,
      gstin: profile.gstin,
      stateCode: profile.state_code,
      stateName: profile.state_name,
    },
    states: STATES,
    subscription: subscription.rows[0]
      ? { status: subscription.rows[0].status, periodEnd: subscription.rows[0].current_period_end }
      : null,
    pendingPayment: pending.rows[0] ? { id: pending.rows[0].id, mode: paymentMode() } : null,
    seller: seller(),
    invoices: invoices.rows.map((row) => ({
      id: row.id,
      number: row.number,
      taxablePaise: row.taxable_paise,
      cgstPaise: row.cgst_paise,
      sgstPaise: row.sgst_paise,
      igstPaise: row.igst_paise,
      totalPaise: row.total_paise,
      buyerName: row.buyer_name,
      buyerGstin: row.buyer_gstin,
      buyerState: row.buyer_state,
      sellerName: row.seller_name,
      sellerGstin: row.seller_gstin,
      issuedAt: row.issued_at,
    })),
  };
}

export async function saveBillingProfile(
  workspaceId: string,
  input: { legalName: string; gstin?: string; stateCode: string },
) {
  const state = stateByCode(input.stateCode);
  const gstin = input.gstin?.trim().toUpperCase() || null;
  if (gstin && !GSTIN_PATTERN.test(gstin)) throw new HttpError(400, "Enter a 15-character GSTIN");
  if (gstin && gstin.slice(0, 2) !== state.code) throw new HttpError(400, "GSTIN does not match the selected state");
  await db.query(
    `INSERT INTO billing_profiles (workspace_id, legal_name, gstin, state_code, state_name)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (workspace_id) DO UPDATE
     SET legal_name = EXCLUDED.legal_name, gstin = EXCLUDED.gstin, state_code = EXCLUDED.state_code, state_name = EXCLUDED.state_name`,
    [workspaceId, input.legalName.trim(), gstin, state.code, state.name],
  );
  return { legalName: input.legalName.trim(), gstin, stateCode: state.code, stateName: state.name };
}

async function startRazorpay(workspaceId: string) {
  const key = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  const planId = process.env.RAZORPAY_PLAN_ID;
  if (!key || !secret || !planId) return null;
  const response = await fetch("https://api.razorpay.com/v1/subscriptions", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      plan_id: planId,
      total_count: 12,
      customer_notify: 1,
      notes: { workspace_id: workspaceId },
    }),
  });
  if (!response.ok) throw new HttpError(502, "Razorpay could not start the UPI AutoPay subscription");
  const body = (await response.json()) as { id?: string; short_url?: string };
  if (!body.id) throw new HttpError(502, "Razorpay could not start the UPI AutoPay subscription");
  return { id: body.id, url: body.short_url ?? null };
}

export async function subscribe(workspaceId: string, workspaceName: string) {
  const profile = await profileFor(workspaceId, workspaceName);
  const quote = quoteFor(profile.state_code);
  const pending = await db.query<{ id: string; subscription_id: string }>(
    `SELECT id, subscription_id FROM payments WHERE workspace_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
    [workspaceId],
  );
  if (pending.rows[0]) {
    const mode = paymentMode();
    return { paymentId: pending.rows[0].id, mode, amountPaise: quote.totalPaise, checkoutUrl: null as string | null };
  }
  const current = await db.query<{ id: string; current_period_end: string | null }>(
    `SELECT id, current_period_end FROM subscriptions
     WHERE workspace_id = $1 AND status = 'active' AND current_period_end > now()
     ORDER BY created_at DESC LIMIT 1`,
    [workspaceId],
  );
  if (current.rows[0]) throw new HttpError(409, "This plan is already paid for the current month");

  const mode = paymentMode();
  const remote = mode === "razorpay" ? await startRazorpay(workspaceId) : null;
  const subscriptionId = randomUUID();
  const paymentId = randomUUID();
  await withTransaction(async (query) => {
    await query(
      `INSERT INTO subscriptions (id, workspace_id, plan_id, status, provider, provider_ref)
       VALUES ($1, $2, $3, 'pending', $4, $5)`,
      [subscriptionId, workspaceId, PLAN.id, mode, remote?.id ?? null],
    );
    await query(
      `INSERT INTO payments (id, workspace_id, subscription_id, status, amount_paise) VALUES ($1, $2, $3, 'pending', $4)`,
      [paymentId, workspaceId, subscriptionId, quote.totalPaise],
    );
  });
  return { paymentId, mode, amountPaise: quote.totalPaise, checkoutUrl: remote?.url ?? null };
}

async function grant(query: Query, workspaceId: string, paymentId: string) {
  const payment = await query<{
    id: string;
    status: string;
    subscription_id: string;
    amount_paise: number;
  }>(
    `SELECT id, status, subscription_id, amount_paise FROM payments WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
    [paymentId, workspaceId],
  );
  const row = payment.rows[0];
  if (!row) throw new HttpError(404, "Payment not found");
  if (row.status === "captured") {
    const existing = await query<{ number: string }>(`SELECT number FROM invoices WHERE payment_id = $1`, [paymentId]);
    return { paymentId, invoiceNumber: existing.rows[0]?.number ?? null, alreadyCaptured: true };
  }
  const profile = await query<Profile>(
    `SELECT legal_name, gstin, state_code, state_name FROM billing_profiles WHERE workspace_id = $1`,
    [workspaceId],
  );
  const workspace = await query<{ name: string }>(`SELECT name FROM workspaces WHERE id = $1`, [workspaceId]);
  const buyer = profile.rows[0] ?? {
    legal_name: workspace.rows[0]?.name || "InField customer",
    gstin: null,
    state_code: "29",
    state_name: "Karnataka",
  };
  const amounts = quoteFor(buyer.state_code);
  const supplier = seller();
  await query(`UPDATE payments SET status = 'captured', amount_paise = $2 WHERE id = $1`, [paymentId, amounts.totalPaise]);
  await query(
    `UPDATE subscriptions SET status = 'active', current_period_end = now() + interval '1 month' WHERE id = $1`,
    [row.subscription_id],
  );
  const before = await query<{ balance: number }>(
    `SELECT balance FROM credit_balances WHERE workspace_id = $1 FOR UPDATE`,
    [workspaceId],
  );
  const previous = before.rows[0]?.balance ?? 0;
  const credited = await query<{ balance: number }>(
    `INSERT INTO credit_balances (workspace_id, balance, monthly_credits)
     VALUES ($1, LEAST($2::int, $3::int), $3::int)
     ON CONFLICT (workspace_id) DO UPDATE
     SET monthly_credits = $3::int,
         balance = LEAST(credit_balances.balance + $2::int, $3::int * $4::int)
     RETURNING balance`,
    [workspaceId, MONTHLY_CREDITS, MONTHLY_CREDITS, ROLLOVER_MULTIPLE],
  );
  await query(
    `INSERT INTO credit_ledger (id, workspace_id, delta, reason, balance_after) VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), workspaceId, credited.rows[0].balance - previous, "subscription", credited.rows[0].balance],
  );
  const seq = await query<{ n: number }>(`SELECT count(*)::int + 1 AS n FROM invoices`);
  const number = `IF7-${new Date().getFullYear()}-${String(seq.rows[0].n).padStart(4, "0")}`;
  await query(
    `INSERT INTO invoices (
      id, workspace_id, payment_id, number, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise,
      buyer_name, buyer_gstin, buyer_state, seller_name, seller_gstin
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      randomUUID(),
      workspaceId,
      paymentId,
      number,
      amounts.taxablePaise,
      amounts.cgstPaise,
      amounts.sgstPaise,
      amounts.igstPaise,
      amounts.totalPaise,
      buyer.legal_name || workspace.rows[0]?.name || "InField customer",
      buyer.gstin,
      buyer.state_name,
      supplier.name,
      supplier.gstin,
    ],
  );
  return { paymentId, invoiceNumber: number, alreadyCaptured: false, balance: credited.rows[0].balance };
}

export async function confirmStubPayment(workspaceId: string, paymentId: string) {
  if (paymentMode() !== "stub") {
    throw new HttpError(400, "This payment is confirmed by Razorpay, not from the app");
  }
  return withTransaction((query) => grant(query, workspaceId, paymentId));
}

export async function captureRazorpay(rawBody: string, signature: string | undefined) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(400, "Razorpay webhook secret is not set");
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!signature || signature !== expected) throw new HttpError(400, "Invalid Razorpay signature");
  const event = JSON.parse(rawBody) as {
    event?: string;
    payload?: { subscription?: { entity?: { id?: string } } };
  };
  if (event.event !== "subscription.charged") return { ok: true };
  const providerRef = event.payload?.subscription?.entity?.id;
  if (!providerRef) return { ok: true };
  const pending = await db.query<{ id: string; workspace_id: string }>(
    `SELECT p.id, p.workspace_id FROM payments p
     JOIN subscriptions s ON s.id = p.subscription_id
     WHERE s.provider_ref = $1 AND p.status = 'pending'
     ORDER BY p.created_at DESC LIMIT 1`,
    [providerRef],
  );
  const payment = pending.rows[0];
  if (!payment) return { ok: true };
  await withTransaction((query) => grant(query, payment.workspace_id, payment.id));
  return { ok: true };
}
