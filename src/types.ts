export type TeamId = "ritual" | "vigilia";
export type Phase = "before" | "live";

export type Me = {
  id: string;
  name: string;
  phone?: string;
  status: "going" | "not_going" | null;
  bringing: string;
  drink: string;
  bringingReady: boolean;
  declinedGame: boolean;
  joinedGame: boolean;
  team: TeamId | null;
  teamSeen: boolean;
  teamDrawn: boolean;
};

export type MissionView = {
  id: string;
  title: string;
  description: string;
  status: "open" | "pending" | "accepted" | "rejected";
  rejectReason: string | null;
};

export type PartyState = {
  party: {
    startsAt: string;
    address: string;
    mapsUrl: string;
    phase: Phase;
    serverNow: string;
    whenLabel: string;
    timezoneLabel: string;
    teamsUnlocked: boolean;
  };
  me: Me | null;
  missions: MissionView[] | null;
  score: { ritual: number; vigilia: number; total: number };
  winner: TeamId | null;
};

export type HostSubmission = {
  id: string;
  missionId: string;
  missionTitle: string;
  team: TeamId | null;
  guestName: string;
  status: "pending" | "accepted" | "rejected";
  rejectReason: string | null;
  photoUrl: string;
  createdAt: string;
};

export type HostOverview = {
  phase: Phase;
  override: "auto" | "live" | "before";
  score: { ritual: number; vigilia: number; total: number };
  winner: TeamId | null;
  counts: { ritual: number; vigilia: number; going: number };
  guests: Me[];
  submissions: HostSubmission[];
  party: { startsAt: string; address: string; whenLabel: string };
  teamsUnlocked: boolean;
};

export const TEAMS: Record<TeamId, { name: string; short: string; line: string }> = {
  ritual: {
    name: "Seita",
    short: "Seita",
    line: "Vocês conduzem o ritual. Completem as cinco marcas.",
  },
  vigilia: {
    name: "Ordem",
    short: "Ordem",
    line: "Vocês interrompem o ritual. Completem as cinco marcas.",
  },
};
