"use client";

import { useEffect, useState } from "react";
import { api, loadSession, type Session } from "@/lib/api";

type Tier = {
  id: string;
  name: string;
  multiplier: number;
  usdPerThousand: number;
  briefCredits: number;
  purchasable: boolean;
};

type Invoice = {
  id: string;
  number: string;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
  buyerName: string;
  buyerGstin: string | null;
  buyerState: string;
  sellerName: string;
  sellerGstin: string | null;
  issuedAt: string;
};

type Billing = {
  plan: { name: string; monthlyCredits: number; briefCredits: number; rolloverMultiple: number; inrPerUsd: number };
  rateCard: Tier[];
  quote: { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number; sameState: boolean };
  balance: number;
  cap: number;
  profile: { legalName: string; gstin: string | null; stateCode: string };
  states: { code: string; name: string }[];
  pendingPayment: { id: string; mode: string } | null;
  subscription: { status: string; periodEnd: string | null } | null;
  seller: { name: string; gstin: string | null };
  invoices: Invoice[];
};

function rupees(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function BillingPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [legalName, setLegalName] = useState("");
  const [gstin, setGstin] = useState("");
  const [stateCode, setStateCode] = useState("29");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh(current: Session) {
    const result = await api<Billing>("/billing", {}, current.token);
    setBilling(result);
    setLegalName(result.profile.legalName || current.workspace.name);
    setGstin(result.profile.gstin ?? "");
    setStateCode(result.profile.stateCode);
  }

  useEffect(() => {
    const current = loadSession();
    if (!current) return;
    setSession(current);
    refresh(current).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load billing"));
  }, []);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      await api("/billing/profile", {
        method: "POST",
        body: JSON.stringify({ legalName, gstin, stateCode }),
      }, session.token);
      await refresh(session);
      setNotice("Billing details saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    if (!session) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/billing/profile", {
        method: "POST",
        body: JSON.stringify({ legalName, gstin, stateCode }),
      }, session.token);
      const started = await api<{ mode: string; checkoutUrl: string | null; paymentId: string }>("/billing/subscribe", {
        method: "POST",
        body: "{}",
      }, session.token);
      if (started.mode === "razorpay" && started.checkoutUrl) {
        window.location.href = started.checkoutUrl;
        return;
      }
      await api("/billing/confirm", {
        method: "POST",
        body: JSON.stringify({ paymentId: started.paymentId }),
      }, session.token);
      await refresh(session);
      setNotice("UPI AutoPay captured in local mode. The GST invoice is below, and the credit pool is filled.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not pay");
    } finally {
      setBusy(false);
    }
  }

  const width = billing && billing.cap > 0 ? Math.min(100, Math.round((billing.balance / billing.cap) * 100)) : 0;

  return (
    <div>
      <h1 className="page-title">Billing</h1>
      <p className="sub">
        One plan. A weekly brief costs {billing?.plan.briefCredits ?? 12} credits on Basic.
        Unused credits roll over up to {billing?.plan.rolloverMultiple ?? 2}× the monthly pool, then the brief stops.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {notice ? <div className="devcode">{notice}</div> : null}

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="muted">Credit pool</div>
        <div className="price">{billing ? billing.balance.toLocaleString("en-IN") : "…"}</div>
        <div className="muted" style={{ marginBottom: 10 }}>
          remaining · monthly pool {billing ? billing.plan.monthlyCredits.toLocaleString("en-IN") : "1,000"} · cap {billing ? billing.cap.toLocaleString("en-IN") : "2,000"}
        </div>
        <div className="meter"><span style={{ width: `${width}%` }} /></div>
        {billing?.subscription?.periodEnd ? (
          <div className="muted" style={{ marginTop: 10 }}>
            Paid through {new Date(billing.subscription.periodEnd).toLocaleDateString("en-IN")}
          </div>
        ) : null}
      </div>

      <div className="grid" style={{ marginBottom: 16 }}>
        {(billing?.rateCard ?? []).map((tier) => (
          <div className="panel" key={tier.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <strong>{tier.name}</strong>
              <span className="pill">{tier.multiplier}×</span>
            </div>
            <div className="price" style={{ marginTop: 8 }}>${tier.usdPerThousand}</div>
            <div className="muted">per 1,000 credits · billed monthly</div>
            <div className="muted" style={{ marginTop: 8 }}>Weekly brief uses {tier.briefCredits} credits</div>
            {tier.purchasable ? <div className="pill" style={{ display: "inline-block", marginTop: 12 }}>This plan</div> : (
              <div className="muted" style={{ marginTop: 12 }}>Shown so the meter matches the rate card. Not sold in this phase.</div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={saveProfile} className="panel" style={{ marginBottom: 16 }}>
        <div className="grid">
          <div className="span-2">
            <label htmlFor="legal">Legal name on the invoice</label>
            <input id="legal" value={legalName} onChange={(event) => setLegalName(event.target.value)} required />
          </div>
          <div>
            <label htmlFor="gstin">GSTIN</label>
            <input id="gstin" value={gstin} onChange={(event) => setGstin(event.target.value.toUpperCase())} placeholder="Optional" />
          </div>
          <div>
            <label htmlFor="state">Place of supply</label>
            <select id="state" value={stateCode} onChange={(event) => setStateCode(event.target.value)}>
              {(billing?.states ?? []).map((state) => (
                <option key={state.code} value={state.code}>{state.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="muted" style={{ marginTop: 12 }}>
          Basic is ${billing?.rateCard[0]?.usdPerThousand ?? 8} per 1,000 credits, converted at ₹{billing?.plan.inrPerUsd ?? 84} per dollar.
          {billing?.quote.sameState ? " Karnataka supply adds CGST 9% and SGST 9%." : " A different state adds IGST 18%."}
          {" "}Total due {billing ? rupees(billing.quote.totalPaise) : "…"}.
        </div>
        <div className="actions" style={{ marginTop: 8 }}>
          <button className="btn secondary" type="submit" disabled={busy}>Save details</button>
          <button className="btn" type="button" onClick={pay} disabled={busy} style={{ width: "auto" }}>
            Pay with UPI AutoPay
          </button>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          Local UPI is stubbed until Razorpay keys are set. Confirming here captures the payment and writes the invoice.
        </div>
      </form>

      <div className="panel">
        <table>
          <thead>
            <tr><th>Invoice</th><th>Buyer</th><th>Tax</th><th>Total</th></tr>
          </thead>
          <tbody>
            {billing?.invoices.length ? billing.invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td>
                  <div>{invoice.number}</div>
                  <div className="muted">{new Date(invoice.issuedAt).toLocaleDateString("en-IN")}</div>
                </td>
                <td>
                  <div>{invoice.buyerName}</div>
                  <div className="muted">{invoice.buyerGstin || "No GSTIN"} · {invoice.buyerState}</div>
                </td>
                <td className="muted">
                  {invoice.igstPaise
                    ? `IGST ${rupees(invoice.igstPaise)}`
                    : `CGST ${rupees(invoice.cgstPaise)} · SGST ${rupees(invoice.sgstPaise)}`}
                  <div>Taxable {rupees(invoice.taxablePaise)}</div>
                </td>
                <td>{rupees(invoice.totalPaise)}</td>
              </tr>
            )) : (
              <tr><td colSpan={4}>No invoice yet.</td></tr>
            )}
          </tbody>
        </table>
        {billing ? (
          <div className="muted" style={{ marginTop: 12 }}>
            Supplier {billing.seller.name}{billing.seller.gstin ? ` · ${billing.seller.gstin}` : " · GSTIN not configured"}.
          </div>
        ) : null}
      </div>
    </div>
  );
}
