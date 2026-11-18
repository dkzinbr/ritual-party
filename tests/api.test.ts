import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FAKE_JPEG, HOST_PIN, cleanupDataDirs, freshApp } from "./helpers.ts";

type App = Awaited<ReturnType<typeof freshApp>>["app"];

let app: App;

beforeEach(async () => {
  ({ app } = await freshApp());
});

afterAll(() => {
  cleanupDataDirs();
});

async function signUp(name: string, phone: string) {
  const res = await request(app).post("/api/guests").send({ name, phone }).expect(201);
  return res.body.token as string;
}

async function hostToken() {
  const res = await request(app).post("/api/host/login").send({ pin: HOST_PIN }).expect(200);
  return res.body.token as string;
}

function asGuest(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function asHost(token: string) {
  return { "x-host-token": token };
}

async function readyPlayer(name: string, phone: string) {
  const token = await signUp(name, phone);
  await request(app)
    .patch("/api/me")
    .set(asGuest(token))
    .send({ status: "going", bringing: "Linguiça", drink: "Refri" })
    .expect(200);
  await request(app).post("/api/me/join").set(asGuest(token)).expect(200);
  return token;
}

describe("API", () => {
  it("reports health", async () => {
    const res = await request(app).get("/api/health").expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("serves the party state to anonymous visitors", async () => {
    const res = await request(app).get("/api/state").expect(200);
    expect(res.body.me).toBeNull();
    expect(res.body.party).toMatchObject({ teamsUnlocked: false });
    expect(res.body.score).toEqual({ ritual: 0, vigilia: 0, total: 5 });
  });

  it("returns validation errors as JSON in Portuguese", async () => {
    const res = await request(app).post("/api/guests").send({ name: "K", phone: "11987654321" }).expect(400);
    expect(res.body.error).toMatch(/nome/i);
  });

  it("answers malformed JSON with 400", async () => {
    await request(app)
      .post("/api/guests")
      .set("Content-Type", "application/json")
      .send("{not json")
      .expect(400);
  });

  it("requires a bearer token for guest actions", async () => {
    await request(app).patch("/api/me").send({ status: "going" }).expect(401);
    await request(app).post("/api/me/join").set(asGuest("forged")).expect(401);
  });

  it("requires a host token for host actions", async () => {
    await request(app).get("/api/host/overview").expect(401);
    await request(app).post("/api/host/draw").set(asHost("forged")).expect(401);
    await request(app).get("/api/host/backup").expect(401);
  });

  it("rejects a wrong host PIN", async () => {
    await request(app).post("/api/host/login").send({ pin: "0000" }).expect(401);
  });

  it("does not leak the host token or other guests' tokens in the state", async () => {
    const token = await signUp("Kimiya", "11987654321");
    await signUp("Zero", "11912345678");
    const res = await request(app).get("/api/state").set(asGuest(token)).expect(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(token);
    expect(body).not.toContain("hostTokens");
  });

  it("runs a full night: RSVP, team draw, photo mission and review", async () => {
    const kimiya = await readyPlayer("Kimiya", "11987654321");
    const zero = await readyPlayer("Zero", "11912345678");
    const hostTok = await hostToken();

    const draw = await request(app).post("/api/host/draw").set(asHost(hostTok)).expect(200);
    expect(draw.body).toMatchObject({ assigned: 2, ritual: 1, vigilia: 1, phase: "live" });

    const reveal = await request(app).post("/api/me/reveal").set(asGuest(kimiya)).expect(200);
    await request(app).post("/api/me/reveal").set(asGuest(zero)).expect(200);
    const team = reveal.body.team as "ritual" | "vigilia";

    const state = await request(app).get("/api/state").set(asGuest(kimiya)).expect(200);
    expect(state.body.me.team).toBe(team);
    expect(state.body.missions).toHaveLength(5);

    const missionId = `${team}-1`;
    await request(app)
      .post(`/api/missions/${missionId}/submissions`)
      .set(asGuest(kimiya))
      .set("Content-Type", "image/jpeg")
      .send(FAKE_JPEG)
      .expect(201);

    const overview = await request(app).get("/api/host/overview").set(asHost(hostTok)).expect(200);
    expect(overview.headers["cache-control"]).toBe("no-store");
    const [photo] = overview.body.submissions;
    expect(photo).toMatchObject({ missionId, guestName: "Kimiya", status: "pending", team });

    const image = await request(app).get(photo.photoUrl).expect(200);
    expect(image.headers["content-type"]).toBe("image/jpeg");
    expect(Buffer.from(image.body)).toEqual(FAKE_JPEG);

    await request(app)
      .post(`/api/host/submissions/${photo.id}`)
      .set(asHost(hostTok))
      .send({ decision: "accepted" })
      .expect(200);

    const after = await request(app).get("/api/state").set(asGuest(kimiya)).expect(200);
    expect(after.body.score[team]).toBe(1);
    expect(after.body.missions[0].status).toBe("accepted");
  });

  it("rejects uploads that are not JPEG", async () => {
    const token = await readyPlayer("Kimiya", "11987654321");
    await request(app).post("/api/host/phase").set(asHost(await hostToken())).send({ override: "live" }).expect(200);
    await request(app)
      .post("/api/missions/ritual-1/submissions")
      .set(asGuest(token))
      .set("Content-Type", "image/png")
      .send(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      .expect(400);
  });

  it("returns 404 for photos that do not exist", async () => {
    await request(app).get("/fotos/nada.jpg").expect(404);
  });

  it("only serves photos from the photos folder", async () => {
    const res = await request(app).get("/fotos/..%2Fparty.json");
    expect(res.status).toBe(404);
  });

  it("exports a backup as a downloadable file", async () => {
    await signUp("Kimiya", "11987654321");
    const res = await request(app).get("/api/host/backup").set(asHost(await hostToken())).expect(200);
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="22evy-\d{4}-\d{2}-\d{2}\.json"$/);
    const backup = JSON.parse(res.text);
    expect(backup.guests).toHaveLength(1);
  });

  it("lets the host remove a guest", async () => {
    const token = await signUp("Kimiya", "11987654321");
    const hostTok = await hostToken();
    const overview = await request(app).get("/api/host/overview").set(asHost(hostTok));
    const id = overview.body.guests[0].id;
    await request(app).delete(`/api/host/guests/${id}`).set(asHost(hostTok)).expect(200);
    const state = await request(app).get("/api/state").set(asGuest(token)).expect(200);
    expect(state.body.me).toBeNull();
  });
});
