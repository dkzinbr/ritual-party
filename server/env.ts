import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

function unquote(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"');
  }
  return trimmed;
}

export function loadEnv() {
  for (const name of [".env", ".env.local", ".env.development.local"]) {
    const file = path.resolve(process.cwd(), name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^(?:export\s+)?([^#=\s]+)\s*=\s*(.*)$/);
      if (!match) continue;
      const key = match[1];
      const value = unquote(match[2] ?? "");
      if (process.env[key] == null || process.env[key] === "") {
        process.env[key] = value;
      }
    }
  }
}

loadEnv();
