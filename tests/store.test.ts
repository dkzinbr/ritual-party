import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FAKE_JPEG, HOST_PIN, cleanupDataDirs, freshStore } from "./helpers.ts";

type Store = Awaited<ReturnType<typeof freshStore>>;

let store: Store;

beforeEach(async () => {
  store = await freshStore();
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(() => {
  cleanupDataDirs();
});

let phoneSeq = 0;
function nextPhone() {
  phoneSeq += 1;
  return `11 9${String(10000000 + phoneSeq).slice(-8)}`;
}

async function guest(name = "Kimiya") {
  const { token } = await store.createGuest(name, nextPhone());
  return token;
}

/** A guest who confirmed, said what they bring and joined the game. */
async function player(name = "Zero") {
  const token = await guest(name);
  await store.updateMe(token, { status: "going", bringing: "Pão de alho", drink: "Guaraná" });
  await store.joinGame(token);
  return token;
}

async function host() {
  const { token } = await store.hostLogin(HOST_PIN);
  return token;
}

/**
 * Some store functions validate input and throw synchronously instead of
 * returning a rejected promise. The Express wrapper handles both, so the tests
 * do the same.
 */
function call<T>(fn: () => T | Promise<T>) {
  return Promise.resolve().then(fn);
}

async function stateOf(token: string | null) {
  return store.publicState(token);
}

/** Draws teams, reveals them to everyone and returns players grouped by team. */
async function playersByTeam(names: string[]) {
  const tokens = [];
  for (const name of names) tokens.push(await player(name));
  const hostToken = await host();
  await store.drawTeams(hostToken);
  const byTeam: Record<"ritual" | "vigilia", string[]> = { ritual: [], vigilia: [] };
  for (const token of tokens) {
    const { team } = await store.revealTeam(token);
    byTeam[team].push(token);
  }
  return { hostToken, byTeam };
}

async function submit(token: string, missionId: string) {
  await store.addSubmission(token, missionId, FAKE_JPEG);
  const overview = await store.hostOverview(await host());
  const submission = overview.submissions.find((item) => item.missionId === missionId && item.status === "pending");
  if (!submission) throw new Error(`no pending submission for ${missionId}`);
  return submission.id;
}

describe("guest sign-up", () => {
  it("creates a guest and returns a session token", async () => {
    const { token } = await store.createGuest("Kassandra", "(11) 98765-4321");
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    const state = await stateOf(token);
    expect(state.me).toMatchObject({ name: "Kassandra", phone: "(11) 98765-4321", status: null });
  });

  it("normalizes names and Brazilian phone numbers", async () => {
    const { token } = await store.createGuest("  Nicolas   Dias ", "+55 11 98765-4321");
    const { me } = await stateOf(token);
    expect(me?.name).toBe("Nicolas Dias");
    expect(me?.phone).toBe("(11) 98765-4321");
  });

  it("accepts landline numbers with 8 digits after the area code", async () => {
    const { token } = await store.createGuest("Kassandra", "1133334444");
    expect((await stateOf(token)).me?.phone).toBe("(11) 3333-4444");
  });

  it.each([
    ["K", "11987654321"],
    ["x".repeat(41), "11987654321"],
    [42, "11987654321"],
  ])("rejects invalid name %j", async (name, phone) => {
    await expect(call(() => store.createGuest(name, phone))).rejects.toMatchObject({ status: 400 });
  });

  it.each(["123", "0198765432", "119876543210", null])("rejects invalid phone %j", async (phone) => {
    await expect(call(() => store.createGuest("Kimiya", phone))).rejects.toMatchObject({ status: 400 });
  });

  it("logs a returning guest back in by phone number and updates the name", async () => {
    const first = await store.createGuest("Kimiya", "11987654321");
    const again = await store.createGuest("Kimiya Sato", "(11) 98765-4321");
    expect(again.token).toBe(first.token);
    expect((await stateOf(first.token)).me?.name).toBe("Kimiya Sato");
  });

  it("caps the guest list at 80 people", async () => {
    for (let index = 0; index < 80; index += 1) await guest(`Convidado ${index}`);
    await expect(call(() => store.createGuest("Atrasado", nextPhone()))).rejects.toMatchObject({ status: 400 });
  });

  it("treats unknown tokens as anonymous visitors", async () => {
    const state = await stateOf("not-a-real-token");
    expect(state.me).toBeNull();
    expect(state.missions).toBeNull();
  });
});

describe("RSVP", () => {
  it("requires a valid session", async () => {
    await expect(store.updateMe("nope", { status: "going" })).rejects.toMatchObject({ status: 401 });
  });

  it("marks bringing as ready only after both food and drink are sent", async () => {
    const token = await guest();
    let me = await store.updateMe(token, { bringing: "  Farofa  " });
    expect(me).toMatchObject({ bringing: "Farofa", bringingReady: false });
    me = await store.updateMe(token, { bringing: "Farofa", drink: "Suco" });
    expect(me.bringingReady).toBe(true);
  });

  it("trims what the guest brings to 280 characters", async () => {
    const token = await guest();
    const me = await store.updateMe(token, { bringing: "a".repeat(400), drink: "" });
    expect(me.bringing).toHaveLength(280);
  });

  it("rejects an unknown RSVP status", async () => {
    const token = await guest();
    await expect(store.updateMe(token, { status: "maybe" })).rejects.toMatchObject({ status: 400 });
  });

  it("removes a guest from the game when they say they are not going", async () => {
    const token = await player();
    const me = await store.updateMe(token, { status: "not_going" });
    expect(me).toMatchObject({ status: "not_going", joinedGame: false, team: null });
  });

  it("only lets confirmed guests decline the game", async () => {
    const token = await guest();
    await expect(store.updateMe(token, { declinedGame: true })).rejects.toMatchObject({ status: 400 });
    await store.updateMe(token, { status: "going" });
    const me = await store.updateMe(token, { declinedGame: true });
    expect(me).toMatchObject({ declinedGame: true, joinedGame: false });
  });
});

describe("joining the game", () => {
  it("requires confirming attendance first", async () => {
    const token = await guest();
    await expect(store.joinGame(token)).rejects.toMatchObject({ status: 400 });
  });

  it("requires saying what you bring first", async () => {
    const token = await guest();
    await store.updateMe(token, { status: "going" });
    await expect(store.joinGame(token)).rejects.toMatchObject({ status: 400 });
  });

  it("joins once and reports repeated joins", async () => {
    const token = await guest();
    await store.updateMe(token, { status: "going", bringing: "Carvão", drink: "Água" });
    expect(await store.joinGame(token)).toEqual({ already: false });
    expect(await store.joinGame(token)).toEqual({ already: true });
  });
});

describe("host login", () => {
  it("rejects a wrong PIN", async () => {
    await expect(store.hostLogin("0000")).rejects.toMatchObject({ status: 401 });
    await expect(store.hostLogin(undefined)).rejects.toMatchObject({ status: 401 });
  });

  it("accepts the PIN from HOST_PIN, ignoring surrounding spaces", async () => {
    const { token } = await store.hostLogin(` ${HOST_PIN} `);
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    await expect(store.hostOverview(token)).resolves.toBeTruthy();
  });

  it("refuses to log anyone in when HOST_PIN is not configured", async () => {
    const pin = process.env.HOST_PIN;
    delete process.env.HOST_PIN;
    try {
      await expect(store.hostLogin("250926")).rejects.toMatchObject({ status: 503 });
    } finally {
      process.env.HOST_PIN = pin;
    }
  });

  it("keeps only the 12 most recent host sessions", async () => {
    const first = await host();
    for (let index = 0; index < 12; index += 1) await host();
    await expect(store.hostOverview(first)).rejects.toMatchObject({ status: 401 });
  });

  it("protects host actions", async () => {
    const guestToken = await guest();
    await expect(store.hostOverview(guestToken)).rejects.toMatchObject({ status: 401 });
    await expect(store.drawTeams(null)).rejects.toMatchObject({ status: 401 });
    await expect(store.setOverride("bad", "live")).rejects.toMatchObject({ status: 401 });
    await expect(store.exportBackup(null)).rejects.toMatchObject({ status: 401 });
  });
});

describe("party phase", () => {
  const base = { version: 1 as const, teamsUnlocked: false, hostTokens: [], guests: [], missions: [], submissions: [] };

  it("switches to live automatically when the party starts", () => {
    const start = new Date(store.PARTY.startsAt).getTime();
    const db = { ...base, override: "auto" as const };
    expect(store.phaseOf(db, start - 1)).toBe("before");
    expect(store.phaseOf(db, start)).toBe("live");
  });

  it("lets the host force a phase", () => {
    const start = new Date(store.PARTY.startsAt).getTime();
    expect(store.phaseOf({ ...base, override: "live" }, start - 60_000)).toBe("live");
    expect(store.phaseOf({ ...base, override: "before" }, start + 60_000)).toBe("before");
  });

  it("validates the host phase command", async () => {
    const hostToken = await host();
    await expect(call(() => store.setOverride(hostToken, "later"))).rejects.toMatchObject({ status: 400 });
    expect(await store.setOverride(hostToken, "live")).toEqual({ override: "live", phase: "live" });
  });
});

describe("team draw", () => {
  it("fails when nobody joined the game", async () => {
    await guest();
    await expect(store.drawTeams(await host())).rejects.toMatchObject({ status: 400 });
  });

  it("splits players into balanced teams and starts the night", async () => {
    const tokens = [];
    for (let index = 0; index < 7; index += 1) tokens.push(await player(`Agente ${index}`));
    const result = await store.drawTeams(await host());
    expect(result).toMatchObject({ assigned: 7, teamsUnlocked: true, phase: "live" });
    expect(Math.abs(result.ritual - result.vigilia)).toBeLessThanOrEqual(1);
    expect(result.ritual + result.vigilia).toBe(7);
  });

  it("places late joiners on the smaller team", async () => {
    await player("Ana");
    await player("Bia");
    const hostToken = await host();
    await store.drawTeams(hostToken);
    await player("Caio");
    const result = await store.drawTeams(hostToken);
    expect(result.assigned).toBe(1);
    expect(result.ritual + result.vigilia).toBe(3);
  });

  it("refuses to draw again when everyone already has a team", async () => {
    await player();
    const hostToken = await host();
    await store.drawTeams(hostToken);
    await expect(store.drawTeams(hostToken)).rejects.toMatchObject({ status: 400 });
  });

  it("does not let players reveal before the host unlocks teams", async () => {
    const token = await player();
    await expect(store.revealTeam(token)).rejects.toMatchObject({ status: 403 });
  });

  it("does not let non-players reveal a team", async () => {
    await player();
    const outsider = await guest("Curioso");
    await store.drawTeams(await host());
    await expect(store.revealTeam(outsider)).rejects.toMatchObject({ status: 400 });
  });
});

describe("missions", () => {
  it("shows five missions only to players of that team, once live", async () => {
    const { byTeam } = await playersByTeam(["Ana", "Bia"]);
    const [ritualPlayer] = byTeam.ritual;
    const [vigiliaPlayer] = byTeam.vigilia;
    const ritual = await stateOf(ritualPlayer ?? null);
    const vigilia = await stateOf(vigiliaPlayer ?? null);
    expect(ritual.missions?.map((mission) => mission.id)).toEqual([
      "ritual-1",
      "ritual-2",
      "ritual-3",
      "ritual-4",
      "ritual-5",
    ]);
    expect(vigilia.missions?.every((mission) => mission.id.startsWith("vigilia-"))).toBe(true);
    expect(ritual.missions?.every((mission) => mission.status === "open")).toBe(true);
  });

  it("hides missions from guests who are not playing", async () => {
    await playersByTeam(["Ana", "Bia"]);
    const outsider = await guest("Curioso");
    expect((await stateOf(outsider)).missions).toBeNull();
  });

  it("rejects uploads before the night starts", async () => {
    const token = await player();
    await store.setOverride(await host(), "before");
    await expect(store.addSubmission(token, "ritual-1", FAKE_JPEG)).rejects.toMatchObject({ status: 403 });
  });

  it("rejects files that are not JPEG", async () => {
    const { byTeam } = await playersByTeam(["Ana", "Bia"]);
    const token = byTeam.ritual[0] ?? "";
    await expect(store.addSubmission(token, "ritual-1", Buffer.alloc(100))).rejects.toMatchObject({ status: 400 });
    await expect(store.addSubmission(token, "ritual-1", Buffer.from([0xff, 0xd8]))).rejects.toMatchObject({
      status: 400,
    });
  });

  it("rejects missions from the other team", async () => {
    const { byTeam } = await playersByTeam(["Ana", "Bia"]);
    const token = byTeam.ritual[0] ?? "";
    await expect(store.addSubmission(token, "vigilia-1", FAKE_JPEG)).rejects.toMatchObject({ status: 404 });
  });

  it("allows only one photo waiting for review per mission", async () => {
    const { byTeam } = await playersByTeam(["Ana", "Bia", "Caio", "Davi"]);
    const [first, second] = byTeam.ritual;
    await store.addSubmission(first ?? "", "ritual-1", FAKE_JPEG);
    await expect(store.addSubmission(second ?? "", "ritual-1", FAKE_JPEG)).rejects.toMatchObject({ status: 400 });
  });

  it("lets the team retry after a rejection and shows the reason", async () => {
    const { hostToken, byTeam } = await playersByTeam(["Ana", "Bia"]);
    const token = byTeam.ritual[0] ?? "";
    const id = await submit(token, "ritual-1");
    await store.reviewSubmission(hostToken, id, "rejected", "  Círculo cortado  ");
    const mission = (await stateOf(token)).missions?.find((item) => item.id === "ritual-1");
    expect(mission).toMatchObject({ status: "rejected", rejectReason: "Círculo cortado" });
    await expect(store.addSubmission(token, "ritual-1", FAKE_JPEG)).resolves.toEqual({ ok: true });
  });

  it("uses a default reason when the host rejects without one", async () => {
    const { hostToken, byTeam } = await playersByTeam(["Ana", "Bia"]);
    const token = byTeam.ritual[0] ?? "";
    const id = await submit(token, "ritual-1");
    await store.reviewSubmission(hostToken, id, "rejected", "");
    const mission = (await stateOf(token)).missions?.find((item) => item.id === "ritual-1");
    expect(mission?.rejectReason).toBe("Tira outra foto, mais clara.");
  });

  it("blocks new photos for an accepted mission", async () => {
    const { hostToken, byTeam } = await playersByTeam(["Ana", "Bia"]);
    const token = byTeam.ritual[0] ?? "";
    await store.reviewSubmission(hostToken, await submit(token, "ritual-1"), "accepted", null);
    await expect(store.addSubmission(token, "ritual-1", FAKE_JPEG)).rejects.toMatchObject({ status: 400 });
  });

  it("validates review decisions", async () => {
    const { hostToken, byTeam } = await playersByTeam(["Ana", "Bia"]);
    const id = await submit(byTeam.ritual[0] ?? "", "ritual-1");
    await expect(store.reviewSubmission(hostToken, id, "maybe", null)).rejects.toMatchObject({ status: 400 });
    await expect(store.reviewSubmission(hostToken, "missing", "accepted", null)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("stores uploaded photos and serves them back", async () => {
    const { byTeam } = await playersByTeam(["Ana", "Bia"]);
    await store.addSubmission(byTeam.ritual[0] ?? "", "ritual-1", FAKE_JPEG);
    const overview = await store.hostOverview(await host());
    const photo = overview.submissions[0];
    expect(photo?.photoUrl).toMatch(/^\/fotos\/[a-z0-9-]+-ritual-1-[0-9a-f]{6}\.jpg$/);
    const filename = photo?.photoUrl.replace("/fotos/", "") ?? "";
    expect(await store.loadUpload(filename)).toEqual(FAKE_JPEG);
  });
});

describe("scoring and winner", () => {
  async function completeTeam(hostToken: string, token: string, team: "ritual" | "vigilia") {
    for (let order = 1; order <= 5; order += 1) {
      await store.reviewSubmission(hostToken, await submit(token, `${team}-${order}`), "accepted", null);
    }
  }

  it("counts only accepted missions", async () => {
    const { hostToken, byTeam } = await playersByTeam(["Ana", "Bia"]);
    const ritual = byTeam.ritual[0] ?? "";
    await store.reviewSubmission(hostToken, await submit(ritual, "ritual-1"), "accepted", null);
    await store.reviewSubmission(hostToken, await submit(ritual, "ritual-2"), "rejected", "x");
    await store.addSubmission(ritual, "ritual-3", FAKE_JPEG);
    expect((await stateOf(ritual)).score).toEqual({ ritual: 1, vigilia: 0, total: 5 });
  });

  it("has no winner until a team completes all five missions", async () => {
    const { hostToken, byTeam } = await playersByTeam(["Ana", "Bia"]);
    const ritual = byTeam.ritual[0] ?? "";
    for (let order = 1; order <= 4; order += 1) {
      await store.reviewSubmission(hostToken, await submit(ritual, `ritual-${order}`), "accepted", null);
    }
    expect((await stateOf(ritual)).winner).toBeNull();
  });

  it("declares the first team to finish as the winner", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T21:00:00-03:00"));
    const { hostToken, byTeam } = await playersByTeam(["Ana", "Bia"]);
    const vigilia = byTeam.vigilia[0] ?? "";
    const ritual = byTeam.ritual[0] ?? "";

    await completeTeam(hostToken, vigilia, "vigilia");
    vi.setSystemTime(new Date("2026-10-31T21:30:00-03:00"));
    await completeTeam(hostToken, ritual, "ritual");

    expect((await stateOf(ritual)).winner).toBe("vigilia");
    expect((await store.hostOverview(hostToken)).winner).toBe("vigilia");
  });

  it("only shows the winner to guests who have seen their team", async () => {
    const { hostToken, byTeam } = await playersByTeam(["Ana", "Bia"]);
    await completeTeam(hostToken, byTeam.ritual[0] ?? "", "ritual");
    const outsider = await guest("Curioso");
    expect((await stateOf(outsider)).winner).toBeNull();
  });
});

describe("host tools", () => {
  it("lists guests alphabetically with team counts", async () => {
    await player("Zero");
    await player("Kimiya");
    await guest("Nicolas");
    const overview = await store.hostOverview(await host());
    expect(overview.guests.map((item) => item.name)).toEqual(["Kimiya", "Nicolas", "Zero"]);
    expect(overview.counts.going).toBe(2);
  });

  it("removes a guest together with their photos", async () => {
    const { hostToken, byTeam } = await playersByTeam(["Ana", "Bia"]);
    const token = byTeam.ritual[0] ?? "";
    await store.addSubmission(token, "ritual-1", FAKE_JPEG);
    const me = (await stateOf(token)).me;
    await store.deleteGuest(hostToken, me?.id ?? "");
    const overview = await store.hostOverview(hostToken);
    expect(overview.guests.find((item) => item.id === me?.id)).toBeUndefined();
    expect(overview.submissions).toHaveLength(0);
    expect((await stateOf(token)).me).toBeNull();
  });

  it("restores a backup with guests and photos", async () => {
    const { hostToken, byTeam } = await playersByTeam(["Ana", "Bia"]);
    await store.addSubmission(byTeam.ritual[0] ?? "", "ritual-1", FAKE_JPEG);
    const backup = JSON.parse((await store.exportBackup(hostToken)).body);
    expect(Object.values(backup.photos)).toHaveLength(1);

    store = await freshStore();
    const newHost = await host();
    expect(await store.restoreBackup(newHost, backup)).toEqual({ guests: 2 });
    const overview = await store.hostOverview(newHost);
    expect(overview.guests).toHaveLength(2);
    const filename = overview.submissions[0]?.photoUrl.replace("/fotos/", "") ?? "";
    expect(await store.loadUpload(filename)).toEqual(FAKE_JPEG);
  });

  it("rejects files that are not party backups", async () => {
    const hostToken = await host();
    await expect(store.restoreBackup(hostToken, null)).rejects.toMatchObject({ status: 400 });
    await expect(store.restoreBackup(hostToken, { guests: "x" })).rejects.toMatchObject({ status: 400 });
  });

  it("keeps restored photo names inside the photos folder", async () => {
    const hostToken = await host();
    const dir = process.env.DATA_DIR ?? "";
    await store.restoreBackup(hostToken, {
      guests: [],
      missions: [],
      photos: { "../../escaped.jpg": FAKE_JPEG.toString("base64") },
    });
    expect(existsSync(path.join(dir, "..", "escaped.jpg"))).toBe(false);
    expect(readdirSync(path.join(dir, "fotos"))).toContain("escaped.jpg");
  });
});
