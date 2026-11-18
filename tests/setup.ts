import { vi } from "vitest";

// Never read the developer's .env / .env.local during tests: they point at the
// real Neon database and Vercel Blob store.
vi.mock("../server/env.ts", () => ({ loadEnv: () => {} }));

for (const key of [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "BLOB_READ_WRITE_TOKEN",
  "VERCEL",
]) {
  delete process.env[key];
}

process.env.HOST_PIN = "4321";
