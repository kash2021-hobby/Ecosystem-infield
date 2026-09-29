import Constants from "expo-constants";

export class ApiError extends Error {
  constructor(
    message: string,
    public offline = false,
  ) {
    super(message);
  }
}

function lanHost() {
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  if (!hostUri) return null;
  const host = hostUri.split(":")[0];
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  return host;
}

const configured = process.env.EXPO_PUBLIC_API_URL;
const host = lanHost();
export const API_URL = configured?.startsWith("https://")
  ? configured
  : host
    ? `http://${host}:4000`
    : (configured ?? "http://127.0.0.1:4000");

const TIMEOUT_MS = 8_000;

export async function api<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers, signal: controller.signal });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new ApiError(
      aborted ? "The server did not answer. Stay on this Wi-Fi and keep the API running." : error instanceof Error ? error.message : "Network request failed",
      true,
    );
  } finally {
    clearTimeout(timer);
  }
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new ApiError(body.error || "Request failed");
  return body;
}
