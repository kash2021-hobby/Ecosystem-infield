"use client";

import { useEffect, useState } from "react";
import { api, loadSession, type Session } from "@/lib/api";

const OUTBOX = "if7-checkin-outbox";

type Queued = { clientId: string; lat: number; lng: number; accuracyM: number; selfieBase64?: string };

function readOutbox(): Queued[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX) ?? "[]") as Queued[];
  } catch {
    return [];
  }
}

export default function CheckInPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [granted, setGranted] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [queued, setQueued] = useState(0);
  const [busy, setBusy] = useState(false);
  const [selfie, setSelfie] = useState<string | undefined>();

  useEffect(() => {
    const current = loadSession();
    if (!current) return;
    setSession(current);
    setQueued(readOutbox().length);
    api<{ granted: boolean }>("/consent", {}, current.token)
      .then((body) => setGranted(body.granted))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
  }, []);

  async function flush(current: Session) {
    const items = readOutbox();
    const left: Queued[] = [];
    for (const item of items) {
      try {
        await api("/check-ins", { method: "POST", body: JSON.stringify(item) }, current.token);
      } catch {
        left.push(item);
      }
    }
    localStorage.setItem(OUTBOX, JSON.stringify(left));
    setQueued(left.length);
    return items.length - left.length;
  }

  async function allow() {
    if (!session) return;
    setError("");
    await api("/consent", { method: "POST", body: "{}" }, session.token);
    setGranted(true);
  }

  async function checkIn() {
    if (!session) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const sent = await flush(session);
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 });
      });
      const payload: Queued = {
        clientId: crypto.randomUUID(),
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracyM: position.coords.accuracy,
        selfieBase64: selfie,
      };
      try {
        const result = await api<{ site?: string; late?: boolean; replayed?: boolean }>(
          "/check-ins",
          { method: "POST", body: JSON.stringify(payload) },
          session.token,
        );
        const late = result.late ? " Marked late." : "";
        setMessage(result.replayed ? "Already recorded." : `Checked in at ${result.site}.${late}${sent ? ` Sent ${sent} saved check-in${sent === 1 ? "" : "s"}.` : ""}`);
      } catch (err) {
        if (err instanceof TypeError) {
          const next = [...readOutbox(), payload];
          localStorage.setItem(OUTBOX, JSON.stringify(next));
          setQueued(next.length);
          setMessage("Saved on this phone. It will send when the connection returns.");
        } else {
          throw err;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setBusy(false);
    }
  }

  if (granted === false) {
    return (
      <div className="panel" style={{ maxWidth: 520 }}>
        <h1 className="page-title">Location for check-in</h1>
        <p className="sub">
          InField uses your location to confirm you are inside a site. It is stored with your attendance for this company. You can refuse, and then check-in stays unavailable.
        </p>
        {error ? <div className="error">{error}</div> : null}
        <button className="btn" style={{ maxWidth: 220 }} onClick={allow}>I agree</button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Check in</h1>
      <p className="sub">This uses the phone or laptop location. A weak fix, or a point outside the fence, is refused.</p>
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="devcode">{message}</div> : null}
      {queued > 0 ? <p className="sub">{queued} check-in waiting to send.</p> : null}
      <label htmlFor="selfie">Photo at the site</label>
      <input
        id="selfie"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => setSelfie(String(reader.result));
          reader.readAsDataURL(file);
        }}
      />
      <button className="btn" style={{ maxWidth: 220 }} disabled={busy || granted !== true} onClick={checkIn}>
        {busy ? "Checking" : "Check in now"}
      </button>
      <button
        className="btn secondary"
        style={{ maxWidth: 220 }}
        type="button"
        onClick={async () => {
          if (!session) return;
          setError("");
          try {
            await api("/sos", { method: "POST", body: "{}" }, session.token);
            setMessage("SOS sent to your manager.");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not send SOS");
          }
        }}
      >
        Send SOS
      </button>
    </div>
  );
}
