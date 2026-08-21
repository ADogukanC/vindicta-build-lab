# Vindicta Build Lab — working context

A Deadlock build optimiser for **Vindicta**. Started as a port of "Zag's Gundicta
DPS Calculator" (an Excel workbook), now a Next.js app driven by the game's own
item data. The point of the tool is comparing builds on **value per soul**.

The user plays Deadlock and knows the game far better than the data does. When
they say a number is wrong, they are usually right — check the workbook and the
game data before defending a calculation.

---

## Running it

**Double-click `run-build-lab.bat`**, or:

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # 89 tests, all must pass
npm run build    # production build
```

**Never run `npm run build` while `npm run dev` is running** — they share
`.next` and the dev server starts throwing `Cannot find module`. Fix: stop both,
`rm -rf .next`, restart.

If a dev server is started from inside a Claude session it dies with that
session. The `.bat` runs under the user's own account and persists — prefer it.

### Moving machines

Copy everything except `node_modules/`, `.next/`, `data/local-db.json`. Then
`npm install`. Recreate `.env` (gitignored):

```
ADMIN_PASSWORD="…"
ADMIN_SESSION_SECRET="…long random…"
```

The database connection strings (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
...) live in `.env.local` and are pulled from Vercel rather than typed by
hand: install the Vercel CLI, `vercel link` (both `.env.local` and `.vercel/`
are gitignored, so a fresh clone has neither), then `vercel env pull`.

---

## Architecture

Next.js 15 App Router, TypeScript, Tailwind v4. Builds live in the browser
(IndexedDB) and are edited entirely client-side; a **Postgres database**
(Neon, via Drizzle) exists solely for sharing — see "Sharing builds" and
"Build browser" below.

```
data/                 seed-items.json, seed-hero.json, seed-progression.json
public/items/         183 item icons
scripts/              re-import item data from deadlock.wiki
src/lib/
  stats.ts            THE STAT REGISTRY — add a stat here first
  types.ts            Item, HeroConfig, Ability, Build
  build.ts            build creation, ordering, migration of saved builds
  buildCode.ts        encode/decode a build to/from a share code
  calc/
    timeline.ts       purchase plan → held loadout at a souls figure
    engine.ts         all damage/survivability math
    metrics.ts        comparable metrics + value-per-soul analysis
    __fixtures__/     frozen workbook values the parity tests run against
  data/store.ts       the local JSON file backing the admin panel
src/components/       build page, compare page, admin panel
```

**Data layer**: the game catalogue (items, hero stats, abilities,
progression) is a bundled seed plus whatever the admin panel has edited into
`data/local-db.json` on whatever machine runs it — no database involved, and
admin edits against a serverless deploy (Vercel's filesystem is ephemeral)
won't persist there — edit locally and redeploy instead. **Shared builds**
are the one thing that does live in a real database: Neon Postgres,
provisioned through the Vercel Marketplace, queried via Drizzle
(`src/lib/data/db/`). `drizzle.config.ts` + `npm run db:generate` /
`npm run db:migrate` manage its one table, `shared_builds`
(`src/lib/data/db/schema.ts`). Migrations need the direct/unpooled
connection string (`DATABASE_URL_UNPOOLED`); the app's own queries use the
pooled one (`DATABASE_URL`) — see the comment in `drizzle.config.ts`.

**Admin** is at `/admin`, gated by `ADMIN_PASSWORD` (single password, no
accounts). Items, hero stats and abilities are editable there, and a
"Submissions" tab (`src/components/admin/SubmissionsPanel.tsx`) is the
build-browser moderation queue — see "Build browser" below.

**Sharing builds**: the "Share" button `POST`s the build's shareable subset
(name, items, sell order, imbue targets, AP order — everything else is the
sender's local viewing state, not part of the build) to `/api/builds`,
which stores it in `shared_builds` and returns a short code for a `/b/<code>`
URL. Opening that link, or pasting the bare code into "Import code",
resolves it via `resolveBuildCode` (`src/lib/buildCode.ts`): the database
first, falling back to the older client-only gzip+base64url codec
(`encodeBuildCode`/`decodeBuildCode`, same file) if the API call fails —
offline, or the database is down — or for links shared before the database
existed. A freshly-shared build is **private by default**: reachable by its
code, but not listed anywhere.

**Build browser** (`/browse`): opt-in, moderated visibility for shared
builds. After sharing, a "Submit for review" button (still in the Share
panel) flips the row's status from `private` to `pending`
(`POST /api/builds/[code]/submit`); an admin then approves or rejects it
from the Submissions tab (`PATCH /api/builds/[code]/review`), and only
`approved` rows are ever returned by `GET /api/builds/directory`, which
`/browse` lists and searches by name. This admin gate is the anti-spam
mechanism — there is no other moderation. A submission is a snapshot: later
edits to the sender's local build never propagate to it.

---

## Item data

**Source: `Data:ItemCards.json` on deadlock.wiki**, which mirrors the game's own
tables. 195 items (156 usable, 22 unreleased/disabled, 17 Street Brawl-only —
excluded since they can't be bought in Standard or Ranked), 183 icons.

For the patch-refresh workflow and the `STAT_MAP` gotchas (resist shred sign,
`ReloadSpeedMultipler` inversion, `MaxStacks` per-stack values), see the
`refresh-item-data` skill (`.claude/skills/refresh-item-data/SKILL.md`).

---

## Game rules the engine encodes

Established with the user over several rounds; several contradict a naive
reading of the data (souls/timeline, headshots, damage types, procs, ricochet,
imbue items, damage multipliers, Mercurial Magnum). Documented next to the code
that implements them: `src/lib/calc/CLAUDE.md`.

---

## Testing

`npm test` — 110 tests in five files.

- **`calc/engine.test.ts`** — parity against the workbook's own cached values,
  each assertion labelled with the cell it reproduces (`B20`, `E36`, `M30`…),
  plus AP-order derivation (spend order, budget cutoff, ability-unlock
  gating). Runs against **frozen fixtures** in `__fixtures__/workbook.ts`,
  not the live seed, so patch updates cannot invalidate the proof that the
  engine reproduces the spreadsheet. Do not repoint these at live data.
- **`calc/timeline.test.ts`** — buy order, refunds, absorption, slot cap.
- **`calc/metrics.test.ts`** — item DPS contributions and purchase
  candidates are scoped to the loadout actually held at the build's souls
  figure, not the whole ordered plan.
- **`data/seed.test.ts`** — guards on the imported catalogue.
- **`buildCode.test.ts`** — round-trips a build through the client-only
  share codec (the fallback path; the database-backed `/api/builds` routes
  and `shared_builds` moderation flow are exercised manually, not by this
  suite).

Where the current patch disagrees with the workbook, the app follows the game
and the README's "Where the current patch disagrees" section explains it.

---

## Conventions

- Adding a stat: one entry in `src/lib/stats.ts`, then wire into `engine.ts` if
  it should change a number and `metrics.ts` if it should be comparable. No
  database migration needed — the flexible half of an item is a JSON column.
- Headline DPS is **burst** (trigger held, reloads ignored) because that is what
  the game quotes. "With reloads" is shown underneath.
- Net worth counts **items only**; boons arrive on their own and charging for
  them would make value-per-soul meaningless.
- Comments explain *why*, not *what*. Cell references are load-bearing — keep
  them when touching ported formulas.
