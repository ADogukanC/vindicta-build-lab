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

---

## Architecture

Next.js 15 App Router, TypeScript, Tailwind v4. **No database.** Builds live
in the browser (IndexedDB) and are shared as copy-pasteable codes — see
"Sharing builds" below.

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

**Data layer**: the app serves the bundled seed and writes admin edits
(items, hero stats, abilities, progression) to `data/local-db.json` on
whatever machine runs it — there is no Postgres/Prisma layer to configure.
Deploy target is plain Vercel; no database add-on needed. The one
consequence: admin edits made against a serverless deploy (Vercel's
filesystem is ephemeral) won't persist — edit locally and redeploy instead.

**Admin** is at `/admin`, gated by `ADMIN_PASSWORD` (single password, no
accounts). Items, hero stats and abilities are all editable there.

**Sharing builds**: the "Share" button gzips the build's JSON and
base64url-encodes it into a `/b/<code>` URL — the code *is* the build, so
opening the link (or pasting the bare code into the "Import code" box)
decodes and imports it entirely client-side. Nothing is ever published to a
server. See `src/lib/buildCode.ts`.

---

## Item data

**Source: `Data:ItemCards.json` on deadlock.wiki**, which mirrors the game's own
tables. 195 items (173 enabled, 22 unreleased/disabled), 183 icons.

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

`npm test` — 89 tests in four files.

- **`calc/engine.test.ts`** — parity against the workbook's own cached values,
  each assertion labelled with the cell it reproduces (`B20`, `E36`, `M30`…).
  Runs against **frozen fixtures** in `__fixtures__/workbook.ts`, not the live
  seed, so patch updates cannot invalidate the proof that the engine reproduces
  the spreadsheet. Do not repoint these at live data.
- **`calc/timeline.test.ts`** — buy order, refunds, absorption, slot cap.
- **`data/seed.test.ts`** — guards on the imported catalogue.
- **`buildCode.test.ts`** — round-trips a build through the share codec.

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
