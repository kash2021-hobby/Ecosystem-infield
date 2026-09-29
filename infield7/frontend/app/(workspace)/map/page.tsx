"use client";

import { useEffect, useRef, useState } from "react";
import { api, loadSession } from "@/lib/api";

type Person = { userId: string; person: string; lat: number; lng: number; site: string | null; recordedAt: string };
type Site = { id: string; name: string; lat: number; lng: number; radiusM: number };

export default function MapPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [error, setError] = useState("");
  const mapNode = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const session = loadSession();
    if (!session) return;
    api<{ people: Person[]; sites: Site[] }>("/presence", {}, session.token)
      .then((body) => {
        setPeople(body.people);
        setSites(body.sites);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
  }, []);

  useEffect(() => {
    const node = mapNode.current;
    if (!node || (people.length === 0 && sites.length === 0)) return;
    let map: { remove: () => void } | undefined;
    let cancelled = false;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      await import("maplibre-gl/dist/maplibre-gl.css");
      if (cancelled || !mapNode.current) return;
      const first = people[0] ?? sites[0];
      const created = new maplibregl.Map({
        container: mapNode.current,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: [first.lng, first.lat],
        zoom: 13,
      });
      for (const site of sites) {
        new maplibregl.Marker({ color: "#1f7a4d" })
          .setLngLat([site.lng, site.lat])
          .setPopup(new maplibregl.Popup().setText(`${site.name} · ${site.radiusM} m`))
          .addTo(created);
      }
      for (const person of people) {
        new maplibregl.Marker()
          .setLngLat([person.lng, person.lat])
          .setPopup(new maplibregl.Popup().setText(person.person))
          .addTo(created);
      }
      map = created;
    })().catch(() => setError("The map tiles did not load. The list below is still current."));
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [people, sites]);

  return (
    <div>
      <h1 className="page-title">Live map</h1>
      <p className="sub">Last check-in for each person. Green pins are sites.</p>
      {error ? <div className="error">{error}</div> : null}
      <div ref={mapNode} style={{ height: 420, borderRadius: 20, overflow: "hidden", marginBottom: 16, background: "var(--if-cream-2)" }} />
      <div className="panel">
        <table>
          <thead><tr><th>Person</th><th>Site</th><th>Seen</th></tr></thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.userId}>
                <td>{person.person}</td>
                <td>{person.site ?? "—"}</td>
                <td>{new Date(person.recordedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</td>
              </tr>
            ))}
            {people.length === 0 ? <tr><td colSpan={3}>Nobody has checked in yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
