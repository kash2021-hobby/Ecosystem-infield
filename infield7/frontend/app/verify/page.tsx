"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, saveSession, type Session } from "@/lib/api";

export default function VerifyPage() {
  const router = useRouter();
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [invite, setInvite] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [phone, setPhone] = useState("");
  const [wait, setWait] = useState(30);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    setPhone(sessionStorage.getItem("if7-phone") ?? "");
    setDevCode(sessionStorage.getItem("if7-dev-code") ?? "");
    const timer = window.setInterval(() => setWait((value) => (value > 0 ? value - 1 : 0)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function write(index: number, value: string) {
    const next = [...digits];
    next[index] = value.replace(/\D/g, "").slice(-1);
    setDigits(next);
    if (next[index] && index < 5) inputs.current[index + 1]?.focus();
  }

  function paste(text: string) {
    const chars = text.replace(/\D/g, "").slice(0, 6).split("");
    if (chars.length === 0) return;
    const next = ["", "", "", "", "", ""];
    chars.forEach((char, index) => {
      next[index] = char;
    });
    setDigits(next);
    inputs.current[Math.min(chars.length, 5)]?.focus();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const code = digits.join("");
    if (code.length !== 6) {
      setError("Enter the 6-digit code");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const session = await api<Session>("/auth/verify", {
        method: "POST",
        body: JSON.stringify({
          phone,
          country_code: sessionStorage.getItem("if7-country") ?? "+91",
          code,
          invite_code: invite || undefined,
        }),
      });
      saveSession(session);
      if (session.user.role === "employee") router.push("/home");
      else router.push(session.workspace.name ? "/attendance" : "/setup");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code expired or invalid");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (wait > 0) return;
    setError("");
    try {
      const result = await api<{ devCode?: string }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          phone,
          country_code: sessionStorage.getItem("if7-country") ?? "+91",
        }),
      });
      if (result.devCode) {
        sessionStorage.setItem("if7-dev-code", result.devCode);
        setDevCode(result.devCode);
      }
      setWait(30);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend");
    }
  }

  return (
    <main className="auth">
      <form className="card" onSubmit={submit}>
        <h1>Enter the code</h1>
        <p className="sub">Sent to {phone || "your phone"}.</p>
        {devCode ? <div className="devcode">Development code {devCode}</div> : null}
        {error ? <div className="error">{error}</div> : null}
        <div className="otp">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(node) => {
                inputs.current[index] = node;
              }}
              inputMode="numeric"
              aria-label={`Digit ${index + 1}`}
              value={digit}
              onChange={(event) => write(index, event.target.value)}
              onPaste={(event) => {
                event.preventDefault();
                paste(event.clipboardData.getData("text"));
              }}
              onKeyDown={(event) => {
                if (event.key === "Backspace" && !digits[index] && index > 0) {
                  inputs.current[index - 1]?.focus();
                }
              }}
            />
          ))}
        </div>
        <label htmlFor="invite" style={{ marginTop: 18 }}>Invite code, if you have one</label>
        <input id="invite" value={invite} onChange={(event) => setInvite(event.target.value.toUpperCase())} placeholder="Optional" />
        <button className="btn" disabled={busy}>{busy ? "Checking" : "Continue"}</button>
        <button className="btn secondary" type="button" disabled={wait > 0} onClick={resend}>
          {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
        </button>
      </form>
    </main>
  );
}
