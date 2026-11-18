import { deleteCookie, getCookie, loadBackupCookie, saveBackupCookie, setCookie } from "./cookies";
import type { HostOverview, PartyState, TeamId } from "./types";

const TOKEN_KEY = "ritual-party-token";
const HOST_KEY = "ritual-party-host";

function persist(name: string, value: string, storage: Storage) {
  setCookie(name, value);
  storage.setItem(name, value);
}

function readPersisted(name: string, storage: Storage) {
  const fromCookie = getCookie(name);
  const fromStorage = storage.getItem(name);
  const value = fromCookie || fromStorage;
  if (value && fromCookie !== value) setCookie(name, value);
  return value;
}

export function getToken() {
  return readPersisted(TOKEN_KEY, localStorage);
}

export function setToken(token: string) {
  persist(TOKEN_KEY, token, localStorage);
}

export function clearToken() {
  deleteCookie(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

export function getHostToken() {
  return readPersisted(HOST_KEY, sessionStorage);
}

export function setHostToken(token: string) {
  persist(HOST_KEY, token, sessionStorage);
}

export function clearHostToken() {
  deleteCookie(HOST_KEY);
  sessionStorage.removeItem(HOST_KEY);
}

function restampAuthCookies() {
  const guest = localStorage.getItem(TOKEN_KEY);
  const host = sessionStorage.getItem(HOST_KEY);
  if (guest) setCookie(TOKEN_KEY, guest);
  if (host) setCookie(HOST_KEY, host);
}

async function parse(res: Response) {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || "Não deu certo. Tente de novo.");
  return data;
}

async function request<T>(path: string, init: RequestInit = {}, token = getToken()): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (typeof init.body === "string") headers.set("Content-Type", "application/json");
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new Error("Sem conexão. Tente de novo.");
  }
  return (await parse(res)) as T;
}

export async function getState() {
  const data = await request<PartyState>("/api/state");
  saveBackupCookie(JSON.stringify(data));
  restampAuthCookies();
  return data;
}

export function createGuest(name: string, phone: string) {
  return request<{ token: string }>("/api/guests", {
    method: "POST",
    body: JSON.stringify({ name, phone }),
  }, null);
}

export function updateMe(patch: {
  name?: string;
  status?: "going" | "not_going";
  bringing?: string;
  drink?: string;
  declinedGame?: boolean;
}) {
  return request("/api/me", { method: "PATCH", body: JSON.stringify(patch) });
}

export function joinGame() {
  return request<{ already: boolean }>("/api/me/join", { method: "POST" });
}

export function leaveGame() {
  return request("/api/me/leave", { method: "POST" });
}

export function revealTeam() {
  return request<{ team: TeamId }>("/api/me/reveal", { method: "POST" });
}

export function uploadPhoto(missionId: string, blob: Blob, onProgress: (pct: number) => void) {
  const token = getToken();
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/missions/${missionId}/submissions`);
    xhr.setRequestHeader("Content-Type", "image/jpeg");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let message = "Não deu certo. Tente de novo.";
      try {
        message = (JSON.parse(xhr.responseText) as { error?: string }).error || message;
      } catch {
        // keep default
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("Sem conexão. A foto não saiu. Tente de novo."));
    xhr.send(blob);
  });
}

async function hostRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getHostToken();
  if (token) headers.set("x-host-token", token);
  if (typeof init.body === "string") headers.set("Content-Type", "application/json");
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new Error("Sem conexão. Tente de novo.");
  }
  return (await parse(res)) as T;
}

export function hostLogin(pin: string) {
  return hostRequest<{ token: string }>("/api/host/login", {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
}

export async function hostOverview() {
  const data = await hostRequest<HostOverview>("/api/host/overview");
  saveBackupCookie(JSON.stringify(data));
  restampAuthCookies();
  return data;
}

export function cachedHostBackup() {
  const raw = loadBackupCookie();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as HostOverview;
  } catch {
    return null;
  }
}

export function reviewPhoto(id: string, decision: "accepted" | "rejected", reason?: string) {
  return hostRequest(`/api/host/submissions/${id}`, {
    method: "POST",
    body: JSON.stringify({ decision, reason }),
  });
}

export function setPhase(override: "auto" | "live" | "before") {
  return hostRequest("/api/host/phase", {
    method: "POST",
    body: JSON.stringify({ override }),
  });
}

export function removeGuest(id: string) {
  return hostRequest(`/api/host/guests/${id}`, { method: "DELETE" });
}

export function setTeamsUnlocked(unlocked: boolean) {
  return hostRequest("/api/host/teams", {
    method: "POST",
    body: JSON.stringify({ unlocked }),
  });
}

export function drawTeams() {
  return hostRequest("/api/host/draw", { method: "POST" });
}

export async function downloadBackup() {
  const headers = new Headers();
  const token = getHostToken();
  if (token) headers.set("x-host-token", token);
  let res: Response;
  try {
    res = await fetch("/api/host/backup", { headers });
  } catch {
    throw new Error("Sem conexão. Tente de novo.");
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Não deu certo. Tente de novo.");
  }
  const blob = await res.blob();
  const name = `22evy-${new Date().toISOString().slice(0, 10)}.json`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function restoreBackup(payload: unknown) {
  return hostRequest("/api/host/restore", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
