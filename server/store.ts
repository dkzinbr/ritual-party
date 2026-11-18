import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { loadEnv } from "./env.ts";
import { deletePhoto, loadPartyJson, loadPhoto, publicPhotoPath, savePartyJson, savePhoto } from "./persist.ts";

loadEnv();

export const PARTY = {
  startsAt: "2026-10-31T18:00:00-03:00",
  address: "Rua Caarapó, 34",
  mapsQuery: "Rua Caarapó 34",
  whenLabel: "Sábado, 31 de outubro · 18h",
  timezoneLabel: "horário de Brasília",
} as const;

export type TeamId = "ritual" | "vigilia";
export type Phase = "before" | "live";
export type Override = "auto" | "live" | "before";
export type GuestStatus = "going" | "not_going";
export type SubmissionStatus = "pending" | "accepted" | "rejected";

export type Guest = {
  id: string;
  token: string;
  name: string;
  phone: string;
  phoneDigits: string;
  status: GuestStatus | null;
  bringing: string;
  drink: string;
  bringingReady: boolean;
  declinedGame: boolean;
  joinedGame: boolean;
  team: TeamId | null;
  teamSeen: boolean;
  createdAt: string;
};

export type Mission = {
  id: string;
  team: TeamId;
  title: string;
  description: string;
  order: number;
};

export type Submission = {
  id: string;
  missionId: string;
  guestId: string;
  filename: string;
  photoUrl?: string;
  status: SubmissionStatus;
  rejectReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

type Db = {
  version: 1;
  override: Override;
  teamsUnlocked: boolean;
  hostTokens: string[];
  guests: Guest[];
  missions: Mission[];
  submissions: Submission[];
};

const MISSIONS: Mission[] = [
  {
    id: "ritual-1",
    team: "ritual",
    order: 1,
    title: "O círculo",
    description:
      "Desenhem um círculo no chão com giz, fita ou barbante. A foto precisa mostrar o círculo inteiro.",
  },
  {
    id: "ritual-2",
    team: "ritual",
    order: 2,
    title: "Três oferendas",
    description:
      "Juntem três objetos quaisquer que virem ingredientes e fotografem os três juntos, dentro do círculo.",
  },
  {
    id: "ritual-3",
    team: "ritual",
    order: 3,
    title: "A marca",
    description:
      "Desenhem o mesmo símbolo na mão de quem está no time. Uma foto com todas as mãos.",
  },
  {
    id: "ritual-4",
    team: "ritual",
    order: 4,
    title: "A chama",
    description:
      "Acendam uma vela ou um isqueiro no centro. A foto precisa mostrar a chama acesa dentro do círculo. Apaguem em seguida.",
  },
  {
    id: "ritual-5",
    team: "ritual",
    order: 5,
    title: "A convocação",
    description: "O time inteiro dentro do círculo, ao mesmo tempo. Uma foto só, com todo mundo.",
  },
  {
    id: "vigilia-1",
    team: "vigilia",
    order: 1,
    title: "O selo",
    description:
      "Prendam um papel com um símbolo de proteção numa porta. A foto mostra o selo e a porta.",
  },
  {
    id: "vigilia-2",
    team: "vigilia",
    order: 2,
    title: "O empréstimo",
    description:
      "Peguem um dos objetos do círculo, fotografem ele fora do círculo e devolvam na hora.",
  },
  {
    id: "vigilia-3",
    team: "vigilia",
    order: 3,
    title: "A barreira",
    description:
      "O time de mãos dadas, bloqueando a passagem até o círculo. A foto mostra a barreira.",
  },
  {
    id: "vigilia-4",
    team: "vigilia",
    order: 4,
    title: "A testemunha",
    description:
      "Alguém de fora do jogo ouve a frase “o ritual para aqui”. Foto dessa pessoa com pelo menos um de vocês.",
  },
  {
    id: "vigilia-5",
    team: "vigilia",
    order: 5,
    title: "A ruptura",
    description:
      "Desfaçam um pedaço visível do círculo, sem estragar o que não é de vocês. A foto mostra o círculo interrompido.",
  },
];

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function emptyDb(): Db {
  return {
    version: 1,
    override: "auto",
    teamsUnlocked: false,
    hostTokens: [],
    guests: [],
    missions: MISSIONS,
    submissions: [],
  };
}

function migrateDb(db: Db) {
  for (const guest of db.guests) {
    if (typeof guest.bringingReady !== "boolean") guest.bringingReady = guest.status === "going";
    if (typeof guest.declinedGame !== "boolean") guest.declinedGame = false;
    if (typeof guest.drink !== "string") guest.drink = "";
    if (typeof guest.teamSeen !== "boolean") guest.teamSeen = false;
    if (typeof guest.phone !== "string") guest.phone = "";
    if (typeof guest.phoneDigits !== "string") guest.phoneDigits = "";
  }
  if (typeof db.teamsUnlocked !== "boolean") db.teamsUnlocked = false;
  return db;
}

async function readDb(): Promise<Db> {
  const raw = await loadPartyJson();
  if (!raw) return emptyDb();
  return migrateDb(JSON.parse(raw) as Db);
}

async function writeDb(db: Db) {
  await savePartyJson(JSON.stringify(db, null, 2));
}

function photoFileName(guestName: string, missionId: string) {
  const slug = guestName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .toLowerCase() || "convidado";
  return `${slug}-${missionId}-${randomBytes(3).toString("hex")}.jpg`;
}

export async function exportBackup(token: string | null) {
  const db = await readDb();
  requireHost(db, token);
  const photos: Record<string, string> = {};
  for (const submission of db.submissions) {
    const bytes = await loadPhoto(submission.filename);
    if (bytes) photos[submission.filename] = bytes.toString("base64");
  }
  return {
    filename: `22evy-${new Date().toISOString().slice(0, 10)}.json`,
    body: JSON.stringify({ ...db, photos }, null, 2),
  };
}

export async function restoreBackup(token: string | null, payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new HttpError(400, "Esse arquivo não é um backup da festa.");
  }
  const next = payload as Partial<Db> & { photos?: Record<string, string> };
  const result = await update((db) => {
    requireHost(db, token);
    if (!Array.isArray(next.guests) || !Array.isArray(next.missions)) {
      throw new HttpError(400, "Esse arquivo não é um backup da festa.");
    }
    db.override = next.override === "live" || next.override === "before" || next.override === "auto" ? next.override : db.override;
    db.teamsUnlocked = Boolean(next.teamsUnlocked);
    db.guests = next.guests as Db["guests"];
    db.missions = next.missions as Db["missions"];
    db.submissions = Array.isArray(next.submissions) ? (next.submissions as Db["submissions"]) : [];
    return { guests: db.guests.length };
  });
  if (next.photos && typeof next.photos === "object") {
    for (const [name, raw] of Object.entries(next.photos)) {
      if (typeof raw !== "string") continue;
      await savePhoto(name, Buffer.from(raw, "base64"));
    }
  }
  return result;
}

export async function update<T>(fn: (db: Db) => T): Promise<T> {
  const db = await readDb();
  const result = fn(db);
  await writeDb(db);
  return result;
}

const listeners = new Set<() => void>();

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publish() {
  for (const listener of listeners) listener();
}

export async function loadUpload(filename: string) {
  return loadPhoto(filename);
}

function hostPin() {
  const pin = process.env.HOST_PIN?.trim();
  if (!pin) {
    throw new HttpError(503, "PIN do mestre não configurado. Defina HOST_PIN no ambiente.");
  }
  return pin;
}

function pinMatches(input: string) {
  const a = Buffer.from(input);
  const b = Buffer.from(hostPin());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function cleanName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 40) return null;
  return name;
}

function cleanPhone(value: unknown) {
  if (typeof value !== "string") return null;
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  if (digits.length < 10 || digits.length > 11) return null;
  const ddd = digits.slice(0, 2);
  if (ddd.startsWith("0")) return null;
  const rest = digits.slice(2);
  const display =
    rest.length === 9 ? `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}` : `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return { digits, display };
}

function cleanBringing(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, 280);
}

export function phaseOf(db: Db, now = Date.now()): Phase {
  if (db.override === "live") return "live";
  if (db.override === "before") return "before";
  return now >= new Date(PARTY.startsAt).getTime() ? "live" : "before";
}

function guestByToken(db: Db, token: string | null) {
  if (!token) return null;
  return db.guests.find((guest) => guest.token === token) ?? null;
}

function requireGuest(db: Db, token: string | null) {
  const guest = guestByToken(db, token);
  if (!guest) throw new HttpError(401, "Entra de novo com o seu nome e telefone.");
  return guest;
}

function requireHost(db: Db, token: string | null) {
  if (!token || !db.hostTokens.includes(token)) {
    throw new HttpError(401, "A sessão do mestre expirou. Entra de novo com o PIN.");
  }
}

function teamCounts(db: Db) {
  const playing = db.guests.filter((guest) => guest.joinedGame && guest.team);
  return {
    ritual: playing.filter((guest) => guest.team === "ritual").length,
    vigilia: playing.filter((guest) => guest.team === "vigilia").length,
  };
}

function assignTeam(db: Db): TeamId {
  const counts = teamCounts(db);
  if (counts.ritual < counts.vigilia) return "ritual";
  if (counts.vigilia < counts.ritual) return "vigilia";
  return Math.random() < 0.5 ? "ritual" : "vigilia";
}

function shuffle<T>(items: T[]) {
  const list = [...items];
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const current = list[index];
    const other = list[swap];
    if (current === undefined || other === undefined) continue;
    list[index] = other;
    list[swap] = current;
  }
  return list;
}

function latestSubmission(db: Db, missionId: string) {
  const list = db.submissions.filter((item) => item.missionId === missionId);
  list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return list[0] ?? null;
}

function scoreOf(db: Db) {
  const total = db.missions.filter((mission) => mission.team === "ritual").length;
  const done = (team: TeamId) =>
    db.missions.filter((mission) => mission.team === team && latestSubmission(db, mission.id)?.status === "accepted")
      .length;
  return { ritual: done("ritual"), vigilia: done("vigilia"), total };
}

function completionTime(db: Db, team: TeamId) {
  const missions = db.missions.filter((mission) => mission.team === team);
  const times: number[] = [];
  for (const mission of missions) {
    const latest = latestSubmission(db, mission.id);
    if (latest?.status !== "accepted" || !latest.reviewedAt) return null;
    times.push(new Date(latest.reviewedAt).getTime());
  }
  return Math.max(...times);
}

export function winnerOf(db: Db): TeamId | null {
  const ritual = completionTime(db, "ritual");
  const vigilia = completionTime(db, "vigilia");
  if (ritual == null && vigilia == null) return null;
  if (ritual != null && vigilia == null) return "ritual";
  if (vigilia != null && ritual == null) return "vigilia";
  return (ritual as number) <= (vigilia as number) ? "ritual" : "vigilia";
}

function publicGuest(guest: Guest) {
  return {
    id: guest.id,
    name: guest.name,
    phone: guest.phone,
    status: guest.status,
    bringing: guest.bringing,
    drink: guest.drink,
    bringingReady: guest.bringingReady,
    declinedGame: guest.declinedGame,
    joinedGame: guest.joinedGame,
    team: guest.team,
    teamSeen: guest.teamSeen,
    teamDrawn: Boolean(guest.team),
  };
}

function guestView(guest: Guest) {
  return {
    ...publicGuest(guest),
    team: guest.teamSeen ? guest.team : null,
  };
}

export async function publicState(token: string | null) {
  const db = await readDb();
  const me = guestByToken(db, token);
  const phase = phaseOf(db);
  const missions =
    phase === "live" && me?.joinedGame && me.team && me.teamSeen
      ? db.missions
          .filter((mission) => mission.team === me.team)
          .sort((a, b) => a.order - b.order)
          .map((mission) => {
            const latest = latestSubmission(db, mission.id);
            const status = latest?.status ?? "open";
            return {
              id: mission.id,
              title: mission.title,
              description: mission.description,
              status: status === "pending" || status === "accepted" || status === "rejected" ? status : "open",
              rejectReason: status === "rejected" ? latest?.rejectReason ?? null : null,
            };
          })
      : null;

  return {
    party: {
      startsAt: PARTY.startsAt,
      address: PARTY.address,
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(PARTY.mapsQuery)}`,
      phase,
      serverNow: new Date().toISOString(),
      whenLabel: PARTY.whenLabel,
      timezoneLabel: PARTY.timezoneLabel,
      teamsUnlocked: db.teamsUnlocked,
    },
    me: me ? guestView(me) : null,
    missions,
    score: scoreOf(db),
    winner: me?.teamSeen ? winnerOf(db) : null,
  };
}

export function createGuest(nameInput: unknown, phoneInput: unknown) {
  const name = cleanName(nameInput);
  const phone = cleanPhone(phoneInput);
  if (!name) throw new HttpError(400, "O nome precisa ter entre 2 e 40 letras.");
  if (!phone) throw new HttpError(400, "Coloca um celular brasileiro com DDD.");
  return update((db) => {
    const existing = db.guests.find((guest) => guest.phoneDigits === phone.digits);
    if (existing) {
      existing.name = name;
      existing.phone = phone.display;
      existing.phoneDigits = phone.digits;
      return { token: existing.token };
    }
    if (db.guests.length >= 80) throw new HttpError(400, "A lista da festa chegou no limite.");
    const guest: Guest = {
      id: randomUUID(),
      token: randomBytes(24).toString("hex"),
      name,
      phone: phone.display,
      phoneDigits: phone.digits,
      status: null,
      bringing: "",
      drink: "",
      bringingReady: false,
      declinedGame: false,
      joinedGame: false,
      team: null,
      teamSeen: false,
      createdAt: new Date().toISOString(),
    };
    db.guests.push(guest);
    return { token: guest.token };
  });
}

export function updateMe(
  token: string | null,
  patch: {
    name?: unknown;
    status?: unknown;
    bringing?: unknown;
    drink?: unknown;
    declinedGame?: unknown;
  },
) {
  return update((db) => {
    const guest = requireGuest(db, token);
    if ("name" in patch && patch.name != null) {
      const name = cleanName(patch.name);
      if (!name) throw new HttpError(400, "O nome precisa ter entre 2 e 40 letras.");
      guest.name = name;
    }
    if ("bringing" in patch) guest.bringing = cleanBringing(patch.bringing);
    if ("drink" in patch) guest.drink = cleanBringing(patch.drink);
    if ("bringing" in patch && "drink" in patch) guest.bringingReady = true;
    if ("status" in patch && patch.status != null) {
      if (patch.status !== "going" && patch.status !== "not_going") {
        throw new HttpError(400, "Confirma se você vai ou não vai.");
      }
      guest.status = patch.status;
      if (patch.status === "not_going") {
        guest.joinedGame = false;
        guest.team = null;
        guest.teamSeen = false;
        guest.declinedGame = false;
      }
    }
    if (patch.declinedGame === true) {
      if (guest.status !== "going") throw new HttpError(400, "Confirme presença antes de responder ao Ritual da Ordem.");
      guest.declinedGame = true;
      guest.joinedGame = false;
      guest.team = null;
      guest.teamSeen = false;
    }
    return publicGuest(guest);
  });
}

export function joinGame(token: string | null) {
  return update((db) => {
    const guest = requireGuest(db, token);
    if (guest.status !== "going") {
      throw new HttpError(400, "Confirme presença antes de entrar no Ritual da Ordem.");
    }
    if (!guest.bringingReady) {
      throw new HttpError(400, "Diz o que você traz para o churrasco e a bebida antes de entrar no Ritual da Ordem.");
    }
    if (guest.joinedGame) return { already: true };
    guest.joinedGame = true;
    guest.declinedGame = false;
    guest.team = null;
    guest.teamSeen = false;
    return { already: false };
  });
}

export function drawTeams(token: string | null) {
  return update((db) => {
    requireHost(db, token);
    const waiting = db.guests.filter((guest) => guest.joinedGame && !guest.team);
    const players = db.guests.filter((guest) => guest.joinedGame);
    const alreadyLive = phaseOf(db) === "live";
    if (players.length === 0) {
      throw new HttpError(400, "Ninguém confirmou participação ainda.");
    }
    if (waiting.length === 0 && db.teamsUnlocked && alreadyLive) {
      throw new HttpError(400, "A brincadeira já está liberada.");
    }
    for (const guest of shuffle(waiting)) {
      guest.team = assignTeam(db);
    }
    for (const guest of db.guests) {
      if (guest.joinedGame && guest.team) guest.teamSeen = true;
    }
    db.teamsUnlocked = true;
    db.override = "live";
    return {
      assigned: waiting.length,
      teamsUnlocked: true,
      phase: phaseOf(db),
      ...teamCounts(db),
    };
  });
}

export function revealTeam(token: string | null) {
  return update((db) => {
    const guest = requireGuest(db, token);
    if (!db.teamsUnlocked) {
      throw new HttpError(403, "O mestre ainda não liberou a revelação das equipes.");
    }
    if (!guest.joinedGame || !guest.team) {
      throw new HttpError(400, "Confirme participação na Noite de ritual primeiro.");
    }
    guest.teamSeen = true;
    return { team: guest.team };
  });
}

export function setTeamsUnlocked(token: string | null, unlocked: unknown) {
  if (unlocked !== true && unlocked !== false) {
    throw new HttpError(400, "Diz se as equipes podem ser reveladas.");
  }
  return update((db) => {
    requireHost(db, token);
    db.teamsUnlocked = unlocked;
    return { teamsUnlocked: db.teamsUnlocked };
  });
}

export function leaveGame(token: string | null) {
  return update((db) => {
    const guest = requireGuest(db, token);
    guest.joinedGame = false;
    guest.team = null;
    guest.teamSeen = false;
    return publicGuest(guest);
  });
}

export async function addSubmission(token: string | null, missionId: string, bytes: Buffer) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 32) {
    throw new HttpError(400, "Não recebi a foto. Tenta de novo.");
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new HttpError(400, "A foto precisa estar em JPEG.");
  }
  const db = await readDb();
  const guest = requireGuest(db, token);
  if (phaseOf(db) !== "live") {
    throw new HttpError(403, "As missões abrem quando a noite começar.");
  }
  if (!guest.joinedGame || !guest.team) {
    throw new HttpError(400, "Entra num time antes de enviar a foto.");
  }
  const mission = db.missions.find((item) => item.id === missionId && item.team === guest.team);
  if (!mission) throw new HttpError(404, "Essa missão não é do seu time.");
  const latest = latestSubmission(db, mission.id);
  if (latest?.status === "accepted") throw new HttpError(400, "Essa marca já foi aceita.");
  if (latest?.status === "pending") throw new HttpError(400, "Já tem uma foto esperando o mestre.");
  const filename = photoFileName(guest.name, mission.id);
  const photoUrl = await savePhoto(filename, bytes);
  return update((next) => {
    const current = requireGuest(next, token);
    next.submissions.push({
      id: randomUUID(),
      missionId,
      guestId: current.id,
      filename,
      photoUrl,
      status: "pending",
      rejectReason: null,
      createdAt: new Date().toISOString(),
      reviewedAt: null,
    });
    return { ok: true };
  });
}

export async function hostLogin(pin: unknown) {
  if (typeof pin !== "string" || !pinMatches(pin.trim())) {
    throw new HttpError(401, "PIN do mestre não confere.");
  }
  const token = randomBytes(24).toString("hex");
  await update((db) => {
    db.hostTokens.push(token);
    db.hostTokens = db.hostTokens.slice(-12);
    return token;
  });
  return { token };
}

export async function hostOverview(token: string | null) {
  const db = await readDb();
  requireHost(db, token);
  const guests = [...db.guests]
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map((guest) => publicGuest(guest));
  const submissions = [...db.submissions]
    .sort((a, b) => {
      const rank = { pending: 0, rejected: 1, accepted: 2 };
      const byStatus = rank[a.status] - rank[b.status];
      if (byStatus !== 0) return byStatus;
      return a.createdAt < b.createdAt ? 1 : -1;
    })
    .map((submission) => {
      const mission = db.missions.find((item) => item.id === submission.missionId);
      const guest = db.guests.find((item) => item.id === submission.guestId);
      return {
        id: submission.id,
        missionId: submission.missionId,
        missionTitle: mission?.title ?? "Missão",
        team: mission?.team ?? null,
        guestName: guest?.name ?? "Alguém",
        status: submission.status,
        rejectReason: submission.rejectReason,
        photoUrl: publicPhotoPath(submission.filename),
        createdAt: submission.createdAt,
      };
    });
  return {
    phase: phaseOf(db),
    override: db.override,
    teamsUnlocked: db.teamsUnlocked,
    score: scoreOf(db),
    winner: winnerOf(db),
    counts: { ...teamCounts(db), going: db.guests.filter((guest) => guest.status === "going").length },
    guests,
    submissions,
    party: {
      startsAt: PARTY.startsAt,
      address: PARTY.address,
      whenLabel: PARTY.whenLabel,
    },
  };
}

export function reviewSubmission(
  token: string | null,
  id: string,
  decision: unknown,
  reason: unknown,
) {
  return update((db) => {
    requireHost(db, token);
    const submission = db.submissions.find((item) => item.id === id);
    if (!submission) throw new HttpError(404, "Não achei essa foto.");
    if (decision !== "accepted" && decision !== "rejected") {
      throw new HttpError(400, "Aceita ou devolve a foto.");
    }
    submission.status = decision;
    submission.reviewedAt = new Date().toISOString();
    submission.rejectReason =
      decision === "rejected" ? cleanBringing(reason).slice(0, 140) || "Tira outra foto, mais clara." : null;
    return { ok: true, winner: winnerOf(db) };
  });
}

export function setOverride(token: string | null, override: unknown) {
  if (override !== "auto" && override !== "live" && override !== "before") {
    throw new HttpError(400, "Não entendi o comando da noite.");
  }
  return update((db) => {
    requireHost(db, token);
    db.override = override;
    return { override: db.override, phase: phaseOf(db) };
  });
}

export async function deleteGuest(token: string | null, id: string) {
  const db = await readDb();
  requireHost(db, token);
  const doomed = db.submissions.filter((item) => item.guestId === id);
  for (const submission of doomed) {
    await deletePhoto(submission.filename);
  }
  db.submissions = db.submissions.filter((item) => item.guestId !== id);
  db.guests = db.guests.filter((guest) => guest.id !== id);
  await writeDb(db);
  return { ok: true };
}
