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
npm test         # 118 tests, all must pass
npm run build    # production build
```

**Never run `npm run build` while `npm run dev` is running** — they share
`.next` and the dev server starts throwing `Cannot find module`. Fix: stop both,
`rm -rf .next`, restart.

If a dev server is started from inside a Claude session it dies with that
session. The `.bat` runs under the user's own account and persists — prefer it.

### Moving machines

Copy everything except `node_modules/` and `.next/`. Then `npm install`.
Recreate `.env` (gitignored):

```
ADMIN_PASSWORD="…"
ADMIN_SESSION_SECRET="…long random…"
```

The database connection strings (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
...) live in `.env.local` and are pulled from Vercel rather than typed by
hand: install the Vercel CLI, `vercel link` (both `.env.local` and `.vercel/`
are gitignored, so a fresh clone has neither), then `vercel env pull`. Without
it, the app still runs, but serves the bundled seed instead of whatever the
admin panel has edited into the database — see "Data layer" below.

---

## Architecture

Next.js 15 App Router, TypeScript, Tailwind v4. Builds live in the browser
(IndexedDB) and are edited entirely client-side. A **Postgres database**
(Neon, via Drizzle) holds everything server-side: the game catalogue the
admin panel edits, and shared builds — see "Data layer", "Sharing builds"
and "Build browser" below.

```
data/                 seed-items.json, seed-hero.json, seed-progression.json — bundled fallback only
public/items/         183 item icons
scripts/              re-import item data from deadlock.wiki; sync the seed into the database
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
  data/store.ts       the database-backed store behind the admin panel
src/components/       build page, compare page, admin panel
```

**Data layer**: the game catalogue (items, hero stats, abilities,
progression) lives in the `game_data` table of the same Neon Postgres
database as shared builds (one JSON-blob row per kind: `items`, `hero`,
`progression`), provisioned through the Vercel Marketplace and queried via
Drizzle (`src/lib/data/db/`, store logic in `src/lib/data/store.ts`). Admin
edits write straight there, so they persist everywhere the app runs — local
dev and the deployed Vercel site read and write the exact same rows, unlike
the old per-machine `data/local-db.json` file this replaced. `data/seed-*.json`
is now only a bundled fallback: what a brand-new database starts from, and
what the app falls back to serving (read-only, edits silently won't stick)
if `DATABASE_URL` is unset or the database is briefly unreachable.

A balance patch hand-edited into `data/seed-items.json` (as opposed to
edited live through the admin panel) needs one more step to actually go
live: `npm run db:sync-seed` overwrites the database's `items`/`hero`/
`progression` rows with the current bundled seed
(`scripts/sync-seed-to-db.ts`). Same after `refresh-item-data`'s wiki
re-import. This clobbers any admin-panel edits made since the last sync, so
export first (Admin panel → Export items) if in doubt.

`drizzle.config.ts` + `npm run db:generate` / `npm run db:migrate` manage the
schema (`src/lib/data/db/schema.ts`): `game_data` and `shared_builds`.
Migrations need the direct/unpooled connection string
(`DATABASE_URL_UNPOOLED`); the app's own queries use the pooled one
(`DATABASE_URL`) — see the comment in `drizzle.config.ts`.

**Admin** is at `/admin`, gated by `ADMIN_PASSWORD` (single password, no
accounts). Items, hero stats and abilities are editable there, and a
"Builds" tab (`src/components/admin/PublishedBuildsPanel.tsx`) lists every
publicly-listed build with a **Delete** action — see "Build browser" below.

**Sharing builds**: clicking "Share" opens a prompt (`SharePrompt.tsx`)
asking up front whether to also list the build on the build browser, before
anything is sent. Confirming `POST`s the build's shareable subset (name,
items, sell order, imbue targets, AP order — everything else is the
sender's local viewing state, not part of the build) to `/api/builds`,
which stores it in `shared_builds` (status `private`) and returns a short
code for a `/b/<code>` URL; if the prompt's checkbox was on, a second call
to `POST /api/builds/[code]/publish` immediately flips it to `public` — no
approval step. Opening the link, or pasting the bare code into "Import
code", resolves it via `resolveBuildCode` (`src/lib/buildCode.ts`): the
database first, falling back to the older client-only gzip+base64url codec
(`encodeBuildCode`/`decodeBuildCode`, same file) if the API call fails —
offline, or the database is down — or for links shared before the database
existed. A build shared without checking the box stays **private by
default** (reachable by its code, not listed anywhere), and the share
result box still offers a "List it" button afterward for the same
immediate, no-approval publish.

**Build browser** (`/browse`): self-service, unmoderated visibility for
shared builds — anyone can list their own build the moment they share it,
or afterward. `GET /api/builds/directory` returns only `public` rows, which
`/browse` lists and searches by name. There is no approval gate and no
"pending"/"rejected" status any more; the only backstop against spam or
stale listings is an admin manually deleting a row (`DELETE
/api/builds/[code]`, from the admin panel's Builds tab) — a hard delete,
killing the share link too, for when a listing is outdated and someone's
improved build should take its place. A public build is a snapshot: later
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

`npm test` — 118 tests in five files.

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
