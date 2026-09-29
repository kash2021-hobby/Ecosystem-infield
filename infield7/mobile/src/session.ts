import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { api } from "./api";

export type Session = {
  token: string;
  user: { id: string; phone: string; role: string; name: string | null; workspaceId: string };
  workspace: { id: string; name: string };
};

const TOKEN = "if7-token";
const PROFILE = "if7-profile";
const PENDING = "if7-pending";

export async function saveSession(session: Session) {
  await SecureStore.setItemAsync(TOKEN, session.token);
  await AsyncStorage.setItem(PROFILE, JSON.stringify({ user: session.user, workspace: session.workspace }));
}

export async function loadSession(): Promise<Session | null> {
  const token = await SecureStore.getItemAsync(TOKEN);
  const raw = await AsyncStorage.getItem(PROFILE);
  if (!token || !raw) return null;
  try {
    const profile = JSON.parse(raw) as Pick<Session, "user" | "workspace">;
    return { token, ...profile };
  } catch {
    return null;
  }
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(TOKEN);
  await AsyncStorage.removeItem(PROFILE);
}

export async function leaveSession() {
  const current = await loadSession();
  await clearSession();
  if (current) api("/auth/logout", { method: "POST", body: "{}" }, current.token).catch(() => undefined);
}

export type PendingSignIn = { phone: string; country: string; devCode?: string; invite?: string };

export function homeHref(session: Session): "/check-in" | "/overview" {
  return session.user.role === "employee" ? "/check-in" : "/overview";
}

const WELCOMED = "if7-welcomed";

export async function needsWelcome(userId: string) {
  try {
    const ids = JSON.parse((await AsyncStorage.getItem(WELCOMED)) ?? "[]") as string[];
    return !ids.includes(userId);
  } catch {
    return true;
  }
}

export async function markWelcomed(userId: string) {
  let ids: string[] = [];
  try {
    ids = JSON.parse((await AsyncStorage.getItem(WELCOMED)) ?? "[]") as string[];
  } catch {
    ids = [];
  }
  if (!ids.includes(userId)) ids.push(userId);
  await AsyncStorage.setItem(WELCOMED, JSON.stringify(ids));
}

export async function savePending(pending: PendingSignIn) {
  await AsyncStorage.setItem(PENDING, JSON.stringify(pending));
}

export async function loadPending(): Promise<PendingSignIn | null> {
  const raw = await AsyncStorage.getItem(PENDING);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingSignIn;
  } catch {
    return null;
  }
}
