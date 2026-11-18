import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import "./env.ts";
import {
  HttpError,
  addSubmission,
  createGuest,
  deleteGuest,
  drawTeams,
  exportBackup,
  hostLogin,
  hostOverview,
  joinGame,
  leaveGame,
  loadUpload,
  publicState,
  publish,
  revealTeam,
  restoreBackup,
  reviewSubmission,
  setOverride,
  setTeamsUnlocked,
  subscribe,
  updateMe,
} from "./store.ts";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "80kb" }));

function one(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function bearer(req: express.Request) {
  const header = req.header("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function wrap(fn: (req: express.Request, res: express.Response) => Promise<unknown> | unknown) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    Promise.resolve()
      .then(() => fn(req, res))
      .catch((err: unknown) => {
        if (err instanceof HttpError) {
          res.status(err.status).json({ error: err.message });
          return;
        }
        next(err);
      });
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/state", wrap(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await publicState(bearer(req)));
}));

app.post("/api/guests", wrap(async (req, res) => {
  const body = req.body as { name?: unknown; phone?: unknown };
  const created = await createGuest(body?.name, body?.phone);
  publish();
  res.status(201).json(created);
}));

app.patch("/api/me", wrap(async (req, res) => {
  const body = req.body as {
    name?: unknown;
    status?: unknown;
    bringing?: unknown;
    drink?: unknown;
    declinedGame?: unknown;
  };
  const me = await updateMe(bearer(req), body);
  publish();
  res.json(me);
}));

app.post("/api/me/join", wrap(async (req, res) => {
  const result = await joinGame(bearer(req));
  publish();
  res.json(result);
}));

app.post("/api/me/leave", wrap(async (req, res) => {
  const me = await leaveGame(bearer(req));
  publish();
  res.json(me);
}));

app.post("/api/me/reveal", wrap(async (req, res) => {
  const result = await revealTeam(bearer(req));
  publish();
  res.json(result);
}));

app.post(
  "/api/missions/:id/submissions",
  express.raw({ type: "image/jpeg", limit: "6mb" }),
  wrap(async (req, res) => {
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const result = await addSubmission(bearer(req), one(req.params.id), bytes);
    publish();
    res.status(201).json(result);
  }),
);

app.post("/api/host/login", wrap(async (req, res) => {
  const body = req.body as { pin?: unknown };
  res.json(await hostLogin(body?.pin));
}));

app.get("/api/host/overview", wrap(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await hostOverview(req.header("x-host-token") ?? null));
}));

app.post("/api/host/submissions/:id", wrap(async (req, res) => {
  const body = req.body as { decision?: unknown; reason?: unknown };
  const result = await reviewSubmission(req.header("x-host-token") ?? null, one(req.params.id), body?.decision, body?.reason);
  publish();
  res.json(result);
}));

app.post("/api/host/phase", wrap(async (req, res) => {
  const body = req.body as { override?: unknown };
  const result = await setOverride(req.header("x-host-token") ?? null, body?.override);
  publish();
  res.json(result);
}));

app.post("/api/host/teams", wrap(async (req, res) => {
  const body = req.body as { unlocked?: unknown };
  const result = await setTeamsUnlocked(req.header("x-host-token") ?? null, body?.unlocked);
  publish();
  res.json(result);
}));

app.post("/api/host/draw", wrap(async (req, res) => {
  const result = await drawTeams(req.header("x-host-token") ?? null);
  publish();
  res.json(result);
}));

app.delete("/api/host/guests/:id", wrap(async (req, res) => {
  const result = await deleteGuest(req.header("x-host-token") ?? null, one(req.params.id));
  publish();
  res.json(result);
}));

app.get("/api/host/backup", wrap(async (req, res) => {
  const file = await exportBackup(req.header("x-host-token") ?? null);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
  res.send(file.body);
}));

app.post("/api/host/restore", express.json({ limit: "25mb" }), wrap(async (req, res) => {
  const result = await restoreBackup(req.header("x-host-token") ?? null, req.body);
  publish();
  res.json(result);
}));

async function sendPhoto(req: express.Request, res: express.Response) {
  const file = path.basename(one(req.params.file));
  const bytes = await loadUpload(file);
  if (!bytes) {
    res.status(404).json({ error: "Foto não encontrada." });
    return;
  }
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "private, max-age=3600");
  if (req.query.download) {
    res.setHeader("Content-Disposition", `attachment; filename="${file}"`);
  }
  res.send(bytes);
}

app.get("/fotos/:file", wrap(sendPhoto));
app.get("/uploads/:file", wrap(sendPhoto));

app.get("/api/events", (req, res) => {
  if (process.env.VERCEL) {
    res.status(204).end();
    return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write("event: ready\ndata: {}\n\n");
  const unsubscribe = subscribe(() => {
    res.write(`data: ${JSON.stringify({ type: "update" })}\n\n`);
  });
  const ping = setInterval(() => {
    res.write(": ping\n\n");
  }, 20000);
  req.on("close", () => {
    clearInterval(ping);
    unsubscribe();
  });
});

const dist = path.resolve(process.cwd(), "dist");
if (existsSync(dist) && !process.env.VERCEL) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api") || req.path.startsWith("/uploads") || req.path.startsWith("/fotos")) {
      next();
      return;
    }
    res.sendFile(path.join(dist, "index.html"));
  });
}

app.use((err: { status?: number; type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.status === 413 || err?.type === "entity.too.large") {
    res.status(413).json({ error: "A foto ficou grande demais. Tira outra, mais de perto." });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Não entendi os dados." });
    return;
  }
  console.error(err);
  if (!res.headersSent) res.status(500).json({ error: "Algo quebrou. Tente de novo." });
});

export default app;
