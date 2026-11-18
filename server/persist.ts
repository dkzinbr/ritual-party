import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, renameSync, readdirSync } from "node:fs";
import path from "node:path";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { put, list, del } from "@vercel/blob";

const PARTY_PATH = "22evy/party.json";
const PHOTO_PREFIX = "22evy/fotos/";
const KEEP_BACKUPS = 30;

type Sql = NeonQueryFunction<false, false>;

function localRoot() {
  return path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
}

function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || "";
}

function useNeon() {
  return Boolean(databaseUrl());
}

function useBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

let memory: string | null = null;
let sqlClient: Sql | null = null;
let schemaReady: Promise<void> | null = null;

function sql(): Sql {
  if (!sqlClient) sqlClient = neon(databaseUrl());
  return sqlClient;
}

async function ensureNeon() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = sql();
      await db`CREATE TABLE IF NOT EXISTS party_kv (
        id TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await db`CREATE TABLE IF NOT EXISTS photos (
        filename TEXT PRIMARY KEY,
        bytes BYTEA NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
}

function snapshotBackup(root: string, payload: string) {
  try {
    const dir = path.join(root, "backups");
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    writeFileSync(path.join(dir, `party-${stamp}.json`), payload);
    const files = readdirSync(dir)
      .filter((name) => name.startsWith("party-") && name.endsWith(".json"))
      .sort();
    while (files.length > KEEP_BACKUPS) {
      const oldest = files.shift();
      if (oldest) unlinkSync(path.join(dir, oldest));
    }
  } catch (err) {
    console.error("Não consegui gravar o backup da festa.", err);
  }
}

async function loadLegacyPartyJson() {
  if (useBlob()) {
    const { blobs } = await list({ prefix: PARTY_PATH, limit: 4 });
    const blob = blobs.find((item) => item.pathname === PARTY_PATH) ?? blobs[0];
    if (!blob) return null;
    const res = await fetch(blob.downloadUrl || blob.url);
    if (!res.ok) return null;
    return await res.text();
  }
  const file = path.join(localRoot(), "party.json");
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8");
}

async function saveLegacyPartyJson(payload: string) {
  if (useBlob()) {
    await put(PARTY_PATH, payload, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json; charset=utf-8",
    });
    return;
  }
  const root = localRoot();
  mkdirSync(root, { recursive: true });
  mkdirSync(path.join(root, "fotos"), { recursive: true });
  const file = path.join(root, "party.json");
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, payload);
  try {
    unlinkSync(file);
  } catch {
    // first write
  }
  renameSync(tmp, file);
  snapshotBackup(root, payload);
}

function photoName(filename: string) {
  return path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "");
}

export function publicPhotoPath(filename: string) {
  return `/fotos/${photoName(filename)}`;
}

function toBuffer(value: unknown): Buffer | null {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") {
    if (value.startsWith("\\x")) return Buffer.from(value.slice(2), "hex");
    if (/^[A-Za-z0-9+/]+=*$/.test(value) && value.length > 32) {
      return Buffer.from(value, "base64");
    }
  }
  return null;
}

async function loadLegacyPhoto(name: string) {
  if (name.startsWith("http://") || name.startsWith("https://")) {
    const res = await fetch(name);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  if (useBlob()) {
    const { blobs } = await list({ prefix: `${PHOTO_PREFIX}${name}`, limit: 1 });
    const blob = blobs[0];
    if (!blob) return null;
    const res = await fetch(blob.downloadUrl || blob.url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  const file = path.join(localRoot(), "fotos", name);
  if (existsSync(file)) return readFileSync(file);
  const legacy = path.join(localRoot(), "uploads", name);
  if (existsSync(legacy)) return readFileSync(legacy);
  return null;
}

async function saveLegacyPhoto(name: string, bytes: Buffer) {
  if (useBlob()) {
    await put(`${PHOTO_PREFIX}${name}`, bytes, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "image/jpeg",
    });
    return;
  }
  const dir = path.join(localRoot(), "fotos");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, name), bytes);
}

export async function loadPartyJson() {
  if (memory) return memory;
  if (useNeon()) {
    await ensureNeon();
    const rows = await sql()`SELECT payload FROM party_kv WHERE id = 'main' LIMIT 1`;
    const row = rows[0] as { payload?: unknown } | undefined;
    if (row?.payload != null) {
      memory = typeof row.payload === "string" ? row.payload : JSON.stringify(row.payload);
      return memory;
    }
    const legacy = await loadLegacyPartyJson();
    if (legacy) {
      await savePartyJson(legacy);
      return legacy;
    }
    return null;
  }
  return loadLegacyPartyJson();
}

export async function savePartyJson(payload: string) {
  memory = payload;
  if (useNeon()) {
    await ensureNeon();
    const data = JSON.parse(payload) as unknown;
    await sql()`INSERT INTO party_kv (id, payload, updated_at)
      VALUES ('main', ${data}, now())
      ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`;
    return;
  }
  await saveLegacyPartyJson(payload);
}

export async function savePhoto(filename: string, bytes: Buffer) {
  const name = photoName(filename);
  if (useNeon()) {
    await ensureNeon();
    await sql()`INSERT INTO photos (filename, bytes, updated_at)
      VALUES (${name}, ${bytes}, now())
      ON CONFLICT (filename) DO UPDATE SET bytes = EXCLUDED.bytes, updated_at = now()`;
    return publicPhotoPath(name);
  }
  await saveLegacyPhoto(name, bytes);
  return publicPhotoPath(name);
}

export async function loadPhoto(filename: string) {
  const name = photoName(filename);
  if (!name && !(filename.startsWith("http://") || filename.startsWith("https://"))) return null;
  if (filename.startsWith("http://") || filename.startsWith("https://")) {
    return loadLegacyPhoto(filename);
  }
  if (useNeon()) {
    await ensureNeon();
    const rows = await sql()`SELECT bytes FROM photos WHERE filename = ${name} LIMIT 1`;
    const row = rows[0] as { bytes?: unknown } | undefined;
    const fromDb = toBuffer(row?.bytes);
    if (fromDb) return fromDb;
    const legacy = await loadLegacyPhoto(name);
    if (legacy) {
      await savePhoto(name, legacy);
      return legacy;
    }
    return null;
  }
  return loadLegacyPhoto(name);
}

export async function deletePhoto(filename: string) {
  const name = photoName(filename);
  if (useNeon()) {
    await ensureNeon();
    await sql()`DELETE FROM photos WHERE filename = ${name}`;
  }
  if (useBlob()) {
    const { blobs } = await list({ prefix: `${PHOTO_PREFIX}${name}`, limit: 1 });
    if (blobs[0]) await del(blobs[0].url);
    return;
  }
  for (const folder of ["fotos", "uploads"]) {
    try {
      unlinkSync(path.join(localRoot(), folder, name));
    } catch {
      // already gone
    }
  }
}
