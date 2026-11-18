import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { vi } from "vitest";

export const HOST_PIN = "4321";

/** Smallest buffer the server accepts as a JPEG (starts with the FF D8 marker). */
export const FAKE_JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);

const tempDirs: string[] = [];

/**
 * Points the store at a brand-new empty data folder and re-imports the server
 * modules, so every test starts from an empty party.
 */
export async function freshDataDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ritual-party-test-"));
  tempDirs.push(dir);
  process.env.DATA_DIR = dir;
  vi.resetModules();
  return dir;
}

export async function freshStore() {
  await freshDataDir();
  return import("../server/store.ts");
}

export async function freshApp() {
  const dir = await freshDataDir();
  const { default: app } = await import("../server/app.ts");
  return { app, dir };
}

export function cleanupDataDirs() {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}
