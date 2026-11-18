# Ritual Party (22Evy)

A mobile-first web app built for a Halloween party, with a live team game inspired by the Brazilian RPG **Ordem Paranormal**.

Guests RSVP from their phones, opt into the game, get drawn into one of two rival factions and race to complete photo missions during the party. The host reviews every photo in real time from a PIN-protected panel, and the first team to get all five missions approved wins.

> The UI is in Brazilian Portuguese, since it was built for a real party in São Paulo.

## Features

### For guests
- **Passwordless sign-up**: name and phone number only. The session is kept with a bearer token in a cookie and `localStorage`.
- **RSVP**: confirm attendance and say what food and drink you're bringing.
- **Opt-in game**: join or skip the team game.
- **Team reveal**: once the host draws teams, each player reveals their faction in-app.
- **Photo missions**: when the party goes live, each team gets five themed missions. Photos are compressed on the device and uploaded with a progress bar.
- **Live scoreboard**: see your team's progress and the winner.

### For the host (`/mestre`)
- PIN login with timing-safe comparison
- Guest list with RSVP status, what each guest is bringing, and the option to remove guests
- Random, balanced team draw
- Photo review queue with approve and reject (with a reason)
- Manual phase control (`auto` / `before` / `live`), plus a time-based switch at party start
- JSON backup export and restore

### The game
Two factions, five missions each:

| Seita (*the cult*) conducts the ritual | Ordem (*the order*) stops it |
| --- | --- |
| 1. The circle | 1. The seal |
| 2. Three offerings | 2. The borrowing |
| 3. The mark | 3. The barrier |
| 4. The flame | 4. The witness |
| 5. The summoning | 5. The rupture |

Missions open when the party goes live and can be done in any order. Each one takes a single JPEG photo, and only one photo per mission can wait for review at a time. A team wins when all five of its missions are approved. If both teams finish, the one whose last approval came first wins.

## Tech stack

| Layer | Tech |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4 |
| Backend | Express 5 (REST API), Server-Sent Events for live updates |
| Storage | Neon serverless Postgres and Vercel Blob, with a local JSON file fallback |
| Deploy | Vercel (serverless function) or Fly.io (Docker and a persistent volume) |

The storage layer in `server/persist.ts` picks a backend at runtime:

1. **Neon Postgres** if `DATABASE_URL` / `POSTGRES_URL` is set (party state as JSONB, photos as `BYTEA`)
2. **Vercel Blob** if `BLOB_READ_WRITE_TOKEN` is set
3. **Local files** in `DATA_DIR` (default `./data`) otherwise, with rotating backups

## Project structure

```
├── api/index.ts        # Vercel serverless entry (wraps the Express app)
├── server/
│   ├── app.ts          # Express routes
│   ├── store.ts        # Game state, rules, missions, auth
│   ├── persist.ts      # Storage backends (Neon / Blob / local)
│   ├── env.ts          # .env loader
│   └── index.ts        # Standalone server entry
├── src/
│   ├── GuestApp.tsx    # Guest experience
│   ├── HostApp.tsx     # Host panel (/mestre)
│   ├── api.ts          # API client
│   └── ...
├── public/             # Images and fonts
├── Dockerfile / fly.toml
└── vercel.json
```

## Getting started

**Requirements:** Node.js 20+

```bash
npm install
```

Create a `.env` file in the project root:

```env
HOST_PIN=your-host-pin        # required: PIN for the /mestre panel
PORT=3000                     # optional

# optional: without these, data is stored in ./data
DATABASE_URL=postgres://...
BLOB_READ_WRITE_TOKEN=...
```

Run in development (API and Vite dev server together):

```bash
npm run dev
```

Build and serve for production:

```bash
npm run serve
```

| Script | Description |
| --- | --- |
| `npm run dev` | API with hot reload + Vite dev server |
| `npm run build` | Type-check and build the frontend into `dist/` |
| `npm start` | Start the Express server (serves `dist/` when present) |
| `npm run serve` | Build, then start |
| `npm run typecheck` | Type-check only |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |

## Tests

The suite uses [Vitest](https://vitest.dev) and [Supertest](https://github.com/ladjs/supertest) and covers:

- **`tests/store.test.ts`**: game rules. Covers sign-up and phone validation, RSVP, joining the game, host PIN and sessions, party phases, balanced team draw, missions (JPEG check, one pending photo per mission, retry after rejection), scoring, the winner rule, guest removal, and backup/restore (including path-traversal safety for photo names).
- **`tests/api.test.ts`**: the Express API end to end. Covers auth on guest and host routes, error responses, and a full night from RSVP to a reviewed photo mission.
- **`tests/cookies.test.ts`**: the cookie helpers and the offline backup that is split across cookies (runs in jsdom).

Each test runs against a fresh temporary data folder. The setup never loads `.env` files, so tests can't touch the real database or blob store.

## Deployment

**Vercel:** `vercel.json` routes `/api/*` and photo URLs to the serverless function in `api/index.ts`, and serves the Vite build statically. Set `HOST_PIN` and the Neon / Blob variables in the project settings. On Vercel the SSE endpoint is disabled (serverless functions can't hold long-lived connections), so the host panel falls back to polling every few seconds.

**Fly.io:** `fly.toml` and `Dockerfile` run the full Express server with a persistent volume mounted at `/data`.

## API overview

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/state` | Party state for the current guest |
| `POST` | `/api/guests` | Sign up (returns a token) |
| `PATCH` | `/api/me` | Update RSVP and what the guest is bringing |
| `POST` | `/api/me/join` · `/leave` · `/reveal` | Join or leave the game, reveal team |
| `POST` | `/api/missions/:id/submissions` | Upload a mission photo |
| `GET` | `/api/events` | SSE stream of updates |
| `POST` | `/api/host/login` | Host login with PIN |
| `GET` | `/api/host/overview` | Host dashboard data |
| `POST` | `/api/host/submissions/:id` | Approve or reject a photo |
| `POST` | `/api/host/draw` · `/teams` · `/phase` | Draw teams, unlock reveal, set phase |
| `GET` / `POST` | `/api/host/backup` · `/restore` | Export or import state |

## Credits

Built by **Henri** ([@dkzinbr](https://github.com/dkzinbr)).

*Ordem Paranormal* is a creation of Rafael Lange (Cellbit). This is an unofficial fan project, made for a private party.
