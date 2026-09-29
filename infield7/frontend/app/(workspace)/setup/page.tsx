"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, loadSession, saveSession, type Session } from "@/lib/api";

const industries = ["Construction & real estate", "Field sales", "Service"];
const sizes = ["1 – 20", "21 – 50", "50 – 100", "100+"];

export default function SetupPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState(industries[0]);
  const [teamSize, setTeamSize] = useState(sizes[0]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const current = loadSession();
    if (!current) return;
    setSession(current);
    setName(current.workspace.name);
    if (current.workspace.industry) setIndustry(current.workspace.industry);
    if (current.workspace.teamSize) setTeamSize(current.workspace.teamSize);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const workspace = await api<Session["workspace"]>(
        "/workspace",
        {
          method: "PATCH",
          body: JSON.stringify({
            name,
            industry,
            teamSize,
            currency: "INR",
            timezone: "Asia/Kolkata",
          }),
        },
        session.token,
      );
      const next = { ...session, workspace };
      saveSession(next);
      setSession(next);
      router.push("/employees");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h1 className="page-title">Tell us about your business</h1>
      <p className="sub">You can change this later.</p>
      {error ? <div className="error">{error}</div> : null}
      <div className="panel grid">
        <div className="span-2">
          <label htmlFor="name">Business name</label>
          <input id="name" value={name} onChange={(event) => setName(event.target.value)} required />
        </div>
        <div>
          <label htmlFor="industry">Industry</label>
          <select id="industry" value={industry} onChange={(event) => setIndustry(event.target.value)}>
            {industries.map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="size">Team size</label>
          <select id="size" value={teamSize} onChange={(event) => setTeamSize(event.target.value)}>
            {sizes.map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>
      </div>
      <button className="btn" style={{ maxWidth: 220 }} disabled={busy}>
        {busy ? "Saving" : "Save and continue"}
      </button>
    </form>
  );
}
