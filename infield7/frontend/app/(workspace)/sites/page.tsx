"use client";

import { useEffect, useState } from "react";
import { api, loadSession, type Session } from "@/lib/api";

type Site = { id: string; name: string; address: string | null; lat: number; lng: number; radiusM: number };

export default function SitesPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("12.9716");
  const [lng, setLng] = useState("77.5946");
  const [radius, setRadius] = useState("150");
  const [start, setStart] = useState("09:30");
  const [end, setEnd] = useState("18:30");
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  async function refresh(current: Session) {
    const body = await api<{ sites: Site[]; shift: { startTime: string; endTime: string } | null }>("/sites", {}, current.token);
    setSites(body.sites);
    if (body.shift) {
      setStart(body.shift.startTime);
      setEnd(body.shift.endTime);
    }
  }

  useEffect(() => {
    const current = loadSession();
    if (!current) return;
    setSession(current);
    refresh(current).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
  }, []);

  async function addSite(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    setError("");
    try {
      await api("/sites", {
        method: "POST",
        body: JSON.stringify({ name, address, lat: Number(lat), lng: Number(lng), radiusM: Number(radius) }),
      }, session.token);
      setName("");
      setAddress("");
      await refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the site");
    }
  }

  async function saveRadius(siteId: string) {
    if (!session) return;
      setError("");
      try {
        await api(`/sites/${siteId}`, {
          method: "PATCH",
          body: JSON.stringify({ radiusM: Number(drafts[siteId] ?? sites.find((item) => item.id === siteId)?.radiusM) }),
        }, session.token);
        setDrafts((current) => {
          const next = { ...current };
          delete next[siteId];
          return next;
        });
        await refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the radius");
    }
  }

  async function saveHours(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    setError("");
    try {
      await api("/shift", { method: "POST", body: JSON.stringify({ startTime: start, endTime: end }) }, session.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save hours");
    }
  }

  const canEdit = session?.user.role !== "employee";

  return (
    <div>
      <h1 className="page-title">Sites</h1>
      <p className="sub">A check-in counts only inside the radius, and only when the GPS fix is sharp enough.</p>
      {error ? <div className="error">{error}</div> : null}
      <div className="panel" style={{ marginBottom: 16 }}>
        <table>
          <thead><tr><th>Name</th><th>Address</th><th>Radius</th></tr></thead>
          <tbody>
            {sites.map((site) => (
              <tr key={site.id}>
                <td>{site.name}</td>
                <td>{site.address || `${site.lat.toFixed(4)}, ${site.lng.toFixed(4)}`}</td>
                <td>
                  {canEdit ? (
                    <form onSubmit={(event) => { event.preventDefault(); void saveRadius(site.id); }} style={{ display: "flex", gap: 8 }}>
                      <input
                        aria-label={`Radius for ${site.name}`}
                        value={drafts[site.id] ?? String(site.radiusM)}
                        onChange={(event) => setDrafts((current) => ({ ...current, [site.id]: event.target.value }))}
                        style={{ width: 88 }}
                      />
                      <button className="btn secondary" type="submit">Save</button>
                    </form>
                  ) : (
                    `${site.radiusM} m`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <div className="grid">
          <form className="panel" onSubmit={addSite}>
            <label htmlFor="site-name">Site name</label>
            <input id="site-name" value={name} onChange={(event) => setName(event.target.value)} required />
            <label htmlFor="address" style={{ marginTop: 12 }}>Address</label>
            <input id="address" value={address} onChange={(event) => setAddress(event.target.value)} />
            <div className="grid" style={{ marginTop: 12 }}>
              <div>
                <label htmlFor="lat">Latitude</label>
                <input id="lat" value={lat} onChange={(event) => setLat(event.target.value)} required />
              </div>
              <div>
                <label htmlFor="lng">Longitude</label>
                <input id="lng" value={lng} onChange={(event) => setLng(event.target.value)} required />
              </div>
            </div>
            <label htmlFor="radius" style={{ marginTop: 12 }}>Radius in metres</label>
            <input id="radius" value={radius} onChange={(event) => setRadius(event.target.value)} required />
            <button className="btn">Add site</button>
          </form>
          <form className="panel" onSubmit={saveHours}>
            <label htmlFor="start">Day starts</label>
            <input id="start" value={start} onChange={(event) => setStart(event.target.value)} />
            <label htmlFor="end" style={{ marginTop: 12 }}>Day ends</label>
            <input id="end" value={end} onChange={(event) => setEnd(event.target.value)} />
            <p className="sub">A check-in more than 15 minutes after the start is marked late.</p>
            <button className="btn secondary">Save hours</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
