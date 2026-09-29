export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type Session = {
  token: string;
  user: { id: string; phone: string; role: string; name: string | null; workspaceId: string };
  workspace: {
    id: string;
    name: string;
    industry: string | null;
    businessType: string | null;
    teamSize: string | null;
    currency: string;
    timezone: string;
  };
};

export function saveSession(session: Session) {
  localStorage.setItem("if7-session", JSON.stringify(session));
}

export function loadSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("if7-session");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem("if7-session");
}

export async function api<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}
