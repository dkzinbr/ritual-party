const YEAR = 60 * 60 * 24 * 400;

function writeCookie(name: string, value: string, maxAge = YEAR) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

function readCookie(name: string) {
  const prefix = `${encodeURIComponent(name)}=`;
  const row = document.cookie.split("; ").find((part) => part.startsWith(prefix));
  if (!row) return null;
  return decodeURIComponent(row.slice(prefix.length));
}

function clearCookie(name: string) {
  writeCookie(name, "", 0);
}

export function getCookie(name: string) {
  return readCookie(name);
}

export function setCookie(name: string, value: string) {
  writeCookie(name, value);
}

export function deleteCookie(name: string) {
  clearCookie(name);
}

const CHUNK = 3200;
const BACKUP_PREFIX = "rp_bak_";
const BACKUP_COUNT = "rp_bak_n";

export function saveBackupCookie(payload: string) {
  const parts = Math.max(1, Math.ceil(payload.length / CHUNK));
  // Too big to store: keep the previous backup instead of wiping it.
  if (parts > 20) return;
  const previous = Number(readCookie(BACKUP_COUNT) || "0");
  for (let index = 0; index < previous; index += 1) clearCookie(`${BACKUP_PREFIX}${index}`);
  for (let index = 0; index < parts; index += 1) {
    writeCookie(`${BACKUP_PREFIX}${index}`, payload.slice(index * CHUNK, (index + 1) * CHUNK));
  }
  writeCookie(BACKUP_COUNT, String(parts));
}

export function loadBackupCookie() {
  const count = Number(readCookie(BACKUP_COUNT) || "0");
  if (!count) return null;
  let body = "";
  for (let index = 0; index < count; index += 1) {
    const piece = readCookie(`${BACKUP_PREFIX}${index}`);
    if (piece == null) return null;
    body += piece;
  }
  return body;
}
