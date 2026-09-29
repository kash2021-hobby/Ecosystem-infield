"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [country, setCountry] = useState("+91");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ devCode?: string }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ phone, country_code: country }),
      });
      sessionStorage.setItem("if7-phone", phone);
      sessionStorage.setItem("if7-country", country);
      if (result.devCode) sessionStorage.setItem("if7-dev-code", result.devCode);
      else sessionStorage.removeItem("if7-dev-code");
      router.push("/verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <form className="card" onSubmit={submit}>
        <div className="brand">
          <div className="mark"><span /></div>
          InField 7
        </div>
        <h1>Sign in with your phone</h1>
        <p className="sub">We will send a 6-digit code. A new number starts a workspace.</p>
        {error ? <div className="error">{error}</div> : null}
        <label htmlFor="phone">Phone number</label>
        <div className="row">
          <input id="country" aria-label="Country code" value={country} onChange={(e) => setCountry(e.target.value)} />
          <input
            id="phone"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </div>
        <button className="btn" disabled={busy}>{busy ? "Sending" : "Continue"}</button>
      </form>
    </main>
  );
}
