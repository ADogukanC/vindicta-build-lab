# Vindicta Build Lab

> Unofficial fan project, not affiliated with, endorsed by, or sponsored by
> Valve Corporation. Deadlock, Vindicta, and all associated names, images, and
> data are trademarks and/or copyrighted material of Valve Corporation.

A web version of *Zag's Gundicta DPS Calculator* for Deadlock: build Vindicta
loadouts, see gun and spirit damage update live, save as many builds as you
like, and compare them on value per soul.

Everything in the workbook has been ported — the investment and boon tables, the
falloff curve, the multiplicative resist-shred stack, the damage-multiplier
penalties — and verified against the workbook's own cached values by an
automated test suite (`npm test`, each assertion labelled with the cell it
reproduces).

The **item catalogue and Vindicta's stats come from
[deadlock.wiki](https://deadlock.wiki)**, which mirrors the game's own data
tables. That means all 156 live items (not just the workbook's 71), with real
component trees, activation types, and the game's own flags for which bonuses
are conditional. Disabled, unreleased, and Street Brawl-only entries are
dropped at import — the last of those can't be bought in Standard or Ranked.
See [Refreshing the data](#refreshing-the-data-after-a-patch).

---

## Running it

**Double-click `run-build-lab.bat`.** It installs dependencies on first run,
starts the server, and stays open. Leave that window open while you use the
site; closing it stops the server.

Or from a terminal:

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. **There is no database, full stop.** The app
serves the bundled item catalogue and Vindicta's stats from JSON, and any
admin edits are written to `data/local-db.json` on your machine. Builds live
in your browser and are shared as copy-pasteable codes (see "Sharing" further
down).

The admin panel is at `/admin`. In development the password defaults to `admin`.

```bash
npm test        # engine parity tests against the workbook
npm run build   # production build
```

> Do not run `npm run build` while `npm run dev` is running — they share the
> `.next` folder and the dev server will start throwing "Cannot find module"
> errors. Stop one before starting the other.

---

## Deploying to Vercel

No database, no add-ons — just the app.

1. **Set two environment variables.** Create `.env` locally (and the same two
   in the Vercel project settings):

   ```
   ADMIN_PASSWORD="something-only-you-know"
   ADMIN_SESSION_SECRET="a-long-random-string"
   ```

   Generate the secret with:

   ```bash
   node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
   ```

2. **Push to GitHub**, import the repo at [vercel.com](https://vercel.com),
   deploy.

One thing worth knowing: admin edits (items, hero stats, progression) write to
`data/local-db.json` on whatever machine handles the request. That works
great locally, but Vercel's serverless filesystem is ephemeral, so edits made
against the live site won't persist between requests. Edit locally with
`npm run dev` and redeploy instead — builds themselves are unaffected, since
they never touch this file at all.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `ADMIN_PASSWORD` | Production | Unlocks `/admin`. Defaults to `admin` in development. |
| `ADMIN_SESSION_SECRET` | Production | Signs the admin session cookie. Any long random string. |

---

## Using it

### A build is a purchase plan, not a shopping list

The order you add items **is the order they get bought**. A souls-earned slider
walks that plan: at 2,400 souls you are holding what 2,400 souls buys, and the
rest of the page — DPS, boons, ability points, everything — is computed for that
moment in the match rather than for a finished build.

The economy it models:

- **Souls earned only ever goes up.** It is what boons and ability points key
  off, and it is the axis two builds are compared on.
- **Components are absorbed, not sold.** Buying Titanic Magazine while holding
  Extended Magazine costs only the 800 difference and consumes the magazine, so
  the plan can legitimately list both.
- **Selling refunds 50%** into your spendable pocket, and is *not* income — so a
  plan that churns items reaches a given loadout later than one that does not.
- **Twelve slots.** When a purchase needs a thirteenth, the next entry in your
  **sell order** goes. If you have not authored one, the app sells the earliest
  purchase, marks that step `?`, and warns you — the plan stays usable, but it
  tells you to make the choice explicit.

Each purchase shows the souls figure it unlocks at, and the slider has a tick at
every one of those points with ◀ ▶ buttons to step between them exactly.

**Build page.** Build tabs run along the top — add, rename (click the active
tab), duplicate, delete, and tick the coloured dot to add a build to the
comparison. Items are added by clicking them in the shop, and reordered with the
▲▼ arrows on each row.

The shop covers all 156 items buyable in Standard or Ranked, filtered by category, tier, the game's own shop
tags, and an actives-only switch. Cards show the activation type and cooldown,
the components an item builds from, and mark conditional bonuses with a ◇.
Components are absorbed when their upgrade is reached on the timeline, exactly
as in game — a plan can list Long Range *and* Sharpshooter, and the upgrade
costs only the difference.

Every situational bonus carries its own switch and stacking items carry a stack
slider, so you can see the honest number as well as the theoretical maximum.

**Ability upgrades** are a progress track, not three switches: they are bought
in order, so clicking a tier takes every tier up to it and clicking a tier you
already own refunds it and everything above. Ability points spent are tracked
against the points your boon count actually gives you.

**The marker on the damage-vs-distance chart** sets the distance used by the
"At the chart marker" readout and the "DPS at chart marker" comparison metric.
Vindicta falls off from 20m to 64m, down to 10% damage, and Long Range /
Sharpshooter / Weighted Shots push those boundaries out — so it answers what
your DPS is actually worth at the range you fight at.

**Conditional bonuses are gated from the data, not assumed.** The workbook
treated everything as permanently active; this does not. A bonus starts **off**
when it is a window you have to open, and **on** only when it is a state you
simply hold. Three signals mark a window, any one of which is enough:

- the bonus's block has its **own cooldown** (Counterspell's +20 spirit: 6s buff
  behind a 23s cooldown)
- it has a **finite duration** (Burst Fire's 4.5s, Kinetic Dash's 7s,
  Spiritual Overflow's 15s charge-up)
- the item is one you have to **press** (Fleetfoot, Vampiric Burst, Warp Stone)

That leaves 20 conditionals on by default, and every one is something you hold
by standing in the right place or having already applied a debuff — Sharpshooter
and Long Range's range bonuses, Close Quarters, Monster Rounds' anti-NPC damage,
the resist shredders.

**Stacks are gated too.** Every stacking item carries a "stacks held" switch,
off by default, because stacks always have to be earned. Escalating Resilience
was the worst offender: 30 stacks of bullet resist, silently assumed. The stack
slider then says how many you hold, and the toggle says whether you hold any.

Each item still has its own switch, and the loadout header carries **all on /
all off** for flipping between "right now" and theoretical maximum.

**Imbue items pick an ability.** All eleven of them carry an *Imbue* dropdown in
the loadout, and their ability-scoped stats land only on the ability you choose —
Compress Cooldown shortens one cooldown, not all four. The imbued ability shows a
◈ in the output panel, and its tooltip gives the spirit power it actually sees.
What each one contributes:

| Item | To the imbued ability |
| --- | --- |
| Surge of Power | +28 spirit power |
| Frostbite Charm | +70 spirit power, −50% cooldown |
| Quicksilver Reload | +44 damage |
| Mercurial Magnum | +60 damage |
| Compress Cooldown | −18% cooldown |
| Duration Extender | +22% duration |
| Mystic Expansion / Ballistic Enchantment | +20% / +22% range |
| Omnicharge Signet | +4 charges |
| Mystic Reverb | +50% ability damage |

An item's *innate* half stays global regardless of what you imbue, which is how
Mercurial Magnum keeps its +7 spirit power, +22% fire rate, +20% ammo and its
per-bullet spirit damage while its +60 goes to one ability.

Imbuing **Flight** is the case to watch: Flight has no cast damage, so the
result shows up in *Flight bonus damage* and the flight DPS that follows from
it, not in the abilities list. Surge of Power on Flight takes the per-bullet
bonus from 36.1 to 43.9 on a 35-boon build (+28 spirit × 0.28 scaling at T3),
and leaves ground DPS alone.

**Souls** shows what the held loadout is worth, alongside what the plan has
spent and refunded to reach it. Boons arrive on their own as the
match runs, so charging the build for them would make every value-per-soul
figure meaningless.

**Spirit power is auditable.** Click the Spirit power row in the output panel
and it expands into every contribution — boons, category investment, each item
separately, and any percentage multiplier applied at the end — with ◇ marking
values only counted because an item's situational toggle is on. If the total
ever disagrees with the game, that list shows which line to blame.

Two things deliberately do **not** count toward it, because the game does not
apply them to your hero: `ImbuedTechPower` (Surge of Power, Frostbite Charm)
grants spirit to the *imbued ability*, and `TechPowerReduction` (Spirit Sap,
Focus Lens) strips spirit from the *enemy*. Both still appear on the item card
as informational rows.

### Headshots

A **headshot slider** (0–100%) on both pages sets how often you hit the head,
and the damage numbers blend body and headshot accordingly. The rules it
follows, which are not the obvious ones:

- A headshot adds **+65% weapon damage**. Items that grant headshot damage stack
  on top, so Headshot Booster's +45% makes a headshot worth +110%.
- **Spirit damage carried by a bullet gains nothing.** Mercurial Magnum's
  per-bullet spirit and Flight's bonus are unchanged by where you hit.
- **Bonuses add, they do not compound.** A Lucky Shot proc on a headshot is
  165% + 100% = **265%** of a bullet, not 165% × 200% = 330%. Both sit on the
  same base, which also means a proc's contribution does not move with headshot
  rate at all.
- **Assassinate has its own +20%**, separate from the gun's 65%, applied to the
  ability rather than to bullets.

On the compare page the slider is shared, since headshot rate is an assumption
about the player rather than the build — comparing at different rates would be
measuring two different people.

### Procs and ricochet

**Chance-based items count toward the headline DPS**, unlike the workbook, which
listed them off to one side. A 25% chance of +100% weapon damage is worth +25%
on an average bullet, so Lucky Shot, Tesla Bullets and Capacitor are folded in
as an expected value per bullet — which then flows correctly into damage per
magazine and DPS. Each one's individual contribution is still listed under
*…of which procs*, and the two always agree: the itemised figures sum to exactly
what was folded in, which a test asserts.

The proc split respects damage types, so Lucky Shot's crit is shredded by bullet
resist while Tesla's shock is shredded by spirit resist.

**Ricochet gets its own section**, because its damage lands on *other* targets —
adding it to the headline would overstate what any one enemy takes. Bullet
damage carries over at 65% and spirit damage in full, so Flight's bonus and
Mercurial Magnum's per-bullet spirit both pass on undiminished. The section
shows per-bullet and DPS figures both per secondary target and across all of
them, on the ground and in flight.

### Burst vs. with reloads

The headline DPS is **burst**: trigger held, reloads ignored. That is the number
the game itself quotes (53.4 for a bare Vindicta) and the one builds are
normally compared on, so it is what the big number, the compare view's "Ground
DPS" and the value-per-soul rankings all use.

Underneath it is the **with reloads** figure, which divides one magazine by a
full fire-and-reload cycle. A bare Vindicta empties 19 rounds in 4.39s and then
reloads for 2.91s, so 53 burst becomes 32 sustained. Reload speed, magazine size
and fire rate trade against each other differently in the two numbers, which is
exactly why both are shown.

**Compare page.** One souls-earned slider drives *every* selected build at once,
so the comparison is always at an equal point in the match. Pick a focus metric
and get: a bar chart across builds at the current position, **a progression
curve sweeping the whole 0–80k range** so you can see exactly where one plan
overtakes another rather than only who is ahead right now, overlaid falloff
curves, and a full metric-by-metric table with deltas against the first build.

Below that is the part the spreadsheet could not do: **value per soul**. For
every item you own, it re-runs the whole build without that one item and shows
what it is actually contributing — including any category investment bonus that
would drop with it. And for every item you do *not* own, it simulates buying it
and ranks them by DPS gained per 1,000 souls. That is a genuine "what should I
buy next" answer for the exact build in front of you.

**Sharing.** *Share* gzips the build and base64url-encodes it into a
`/b/<code>` link, then copies it to your clipboard — the code *is* the build,
so there is nothing to publish and nothing for the server to store. Opening
the link decodes it client-side and adds it to the visitor's own library as
an editable copy; pasting the bare code (no need for the full link) into the
"Import code" box does the same. *Export all* and *Import file* separately
move your whole library as a JSON file, for backing it up.

Builds are stored in your browser (IndexedDB), not on the server, so editing is
instant and needs no account. Export regularly if they matter to you.

---

## Adding items

`/admin` → **Items**. Pick an item or hit **+ New**. You get:

- name, slug, category, soul cost, and an icon upload (downscaled to a 96px
  WebP automatically, so it costs a couple of kilobytes)
- a grid of **every stat in the registry** — press *show all stats* to see the
  ones this item does not use yet
- **per stack**, **per hero boon**, and **per point of spirit power** stat
  grids, for items that scale
- a conditional label, which gives the item its on/off switch in builds
- resist shred (including per-stack and spirit-scaling shred) and a damage
  multiplier for Cursed-Relic-style downsides

Percentages are entered as whole numbers: `25` means +25%.

### Adding a stat the game has that we do not model yet

Add one entry to `STAT_DEFS` in [`src/lib/stats.ts`](src/lib/stats.ts):

```ts
{ key: "myNewStat", label: "My New Stat", group: "vitality", kind: "percent" },
```

It immediately appears in the admin form and on item tooltips. The database
needs no migration — the flexible half of each item lives in a JSON column.
If the stat should change a calculated number, wire it up in
[`src/lib/calc/engine.ts`](src/lib/calc/engine.ts); if it should be comparable,
add it to [`src/lib/calc/metrics.ts`](src/lib/calc/metrics.ts).

---

## Refreshing the data after a patch

```bash
python scripts/fetch_wiki_data.py
python scripts/convert_items.py
python scripts/fetch_icons.py
npm test
```

`convert_items.py` holds the mapping from the game's stat keys to the
calculator's (`STAT_MAP`), and documents three conventions in the game data
worth knowing: resist shred is stored as a *negative resist*, `ReloadSpeedMultipler`
is stored inverted, and a block containing `MaxStacks` describes per-stack
values. Stats it cannot map are kept on the item as display-only info rows
rather than silently dropped.

`npm test` is the safety net here: `src/lib/data/seed.test.ts` fails if a patch
introduces a stat key the registry does not know, a component pointing at a
missing item, or a shop item with no icon.

---

## Abilities

All four abilities carry their real numbers from the wiki, in the right order:
Stake, Flight, Crow Familiar, Assassinate. Each has its three purchasable
upgrades with their ability-point costs, and the build page tracks AP spent
against AP available, warning you if a build overspends.

The upgrades that change gun math are wired into the engine:

| Ability | Effect |
| --- | --- |
| Crow Familiar | −6% bullet and spirit resist; −14% with T3 |
| Assassinate | +6% weapon damage per kill stack; +10% with T3 |
| Flight | +10 spirit damage per bullet + 0.18 × spirit; T3 makes it 20 + 0.28 × spirit |
| Flight T1 | +50% of the base magazine while flying |

Note that Flight's enlarged magazine is the **T1 upgrade**, not part of the base
ability — the workbook always applied it. A new build starts with Flight T1 and
T3 selected so it lines up with the sheet.

Editing any of this is in `/admin` → **Hero**. Each ability shows only the
fields that apply to it: Flight has no damage fields because it deals no direct
damage, and effects like "bullet resist shred" only appear on abilities that
actually have them, with the rest one click away behind **+ effect**.

---

## Two workbook quirks, preserved on purpose

The port matches the workbook to 6 decimal places, including two things that
look like slips. Both are documented at the top of
[`src/lib/calc/engine.ts`](src/lib/calc/engine.ts).

**1. Spirit items do not raise gun damage.** Vindicta's gun damage gains 0.022
per point of spirit power, but the workbook feeds *pre-item* spirit into that
term (`B20` uses `B21`, not `E21`), so Boundless Spirit adds nothing to bullet
damage in the sheet. **The app always uses total spirit power**, which is how
the game behaves. The `gunDamageUsesTotalSpirit` flag survives on the build
model with no UI, purely so the parity tests can switch it off and reproduce the
sheet.

**2. The no-item Flight column uses the wrong magazine.** `H21` multiplies by
the base 19-round magazine even though `B27` directly above it computes the
28.5-round Flight magazine, and the with-items equivalent (`M26`) does use the
Flight magazine. The app follows `B27`/`M26`. This only affects the reference
column, never a real build.

One thing was **fixed** rather than preserved: the "On Ground" shred cells
multiply the damage-multiplier penalty in twice (`N20 = M20*(1+E30)*B48`, where
`M20` already contains `B48`), while the Flight rows apply it once. The app
applies it once everywhere.

### Where the current patch disagrees with the workbook

The workbook was written against an older patch. Three differences are worth
knowing about, all of them cases where the app follows the current game data:

- **Cursed Relic no longer costs you damage.** The workbook applied a 0.86
  multiplier to your own output. In the current data it is an active you cast on
  an enemy, and the −25% outgoing damage is a debuff on *them*. The app treats it
  as a debuff and does not reduce your damage. Golden Goose Egg's −10% is still a
  penalty on yourself, so its 0.9 multiplier survives exactly as the sheet had it.
- **Mercurial Magnum** follows the workbook's `E35`:
  `((0.25 + spirit × 0.0049) × base gun damage) × spirit amp`. The game data's
  "25" is a *percentage of base gun damage*, not flat damage, and the 0.49% per
  point of spirit scaling is not in the export at all — so the percentage is
  imported and the scaling comes from the sheet. It is no longer special-cased:
  the stat is generic, and the damage is correctly reduced by spirit resist
  rather than bullet resist.
- **Per-boon scaling moved slightly**: gun damage 0.49 → 0.495, health 29 → 28.

Because these change the numbers, the parity tests run against a frozen copy of
the workbook's own hero and item values in
[`src/lib/calc/__fixtures__/workbook.ts`](src/lib/calc/__fixtures__/workbook.ts).
That keeps them meaningful — they prove the *engine* still reproduces the
spreadsheet, independently of how the game has been patched since.

Separately, note that damage penalties add rather than compound: two items at
0.86 and 0.9 give 0.76, not 0.774. The engine reproduces that.

---

## Layout

```
data/                seed-items.json, seed-hero.json, seed-progression.json
public/items/        173 item icons, downloaded from deadlock.wiki
scripts/             re-import the catalogue after a patch
src/lib/stats.ts     the stat registry — start here to add a stat
src/lib/types.ts     item, hero, ability and build models
src/lib/buildCode.ts encode/decode a build to/from a share code
src/lib/calc/
  engine.ts          the calculation engine
  engine.test.ts     workbook parity tests, each labelled with its cell
  __fixtures__/      the frozen workbook values those tests run against
  metrics.ts         comparable metrics + value-per-soul analysis
src/lib/data/
  store.ts           the local JSON file backing item/hero/progression edits
  seed.test.ts       guards on the imported catalogue
src/components/      build page, compare page, admin panel
```
