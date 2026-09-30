---
name: refresh-item-data
description: Re-import Deadlock item data from deadlock.wiki after a game patch (fetch wiki data, convert to seed items, fetch icons, run tests). Use when item stats are out of date after a patch or the user asks to refresh/re-import item data.
---

# Refresh item data

**Source: `Data:ItemCards.json` on deadlock.wiki**, which mirrors the game's own
tables. 195 items (156 usable, 22 unreleased/disabled, 17 Street Brawl-only —
excluded since they can't be bought in Standard or Ranked), 183 icons.

Refresh after a patch:

```bash
python scripts/fetch_wiki_data.py
python scripts/convert_items.py
python scripts/build_corruption.py   # convert_items.py doesn't write corruption — always run this after it
python scripts/fetch_icons.py
npm test           # seed.test.ts fails on unmapped stats, bad components, missing icons
npm run db:sync-seed   # pushes the refreshed seed into the live database — see CLAUDE.md's Data layer
```

**Beware a full `convert_items.py` run**: the committed seed carries hand
curation the raw conversion loses (notes, shop filters, Sharpshooter /
Cultist Sacrifice / Echo Shard gating, the `armor-piercing-rounds` slug —
the export now calls it "Armor Piercer", which would orphan saved builds).
Diff the result against HEAD before keeping it; for a patch that only moves
a few numbers, hand-editing the seed is safer.

## Corruption (the Broker)

`scripts/build_corruption.py` rewrites only `item.corruption` on every
Tier 3/4 seed item and leaves everything else alone, so it is safe to run on
its own. Two sources:

- `CorruptedUpgrades` in `Data:ItemCards.json` — per raw key, a delta on the
  item's own value. The script converts each item with `convert_record` once
  as-is and once per corrupted key with that delta applied; the difference is
  the key's contribution, so it lands in exactly the bag its base value does
  (per-stack, conditional, shred, proc, imbue…). It then re-homes a delta into
  whichever bag the *seed* keeps that stat in, since the seed's gating wins
  (`BAG_OVERRIDES` for the one ambiguous case, Sharpshooter).
- `scripts/Data_Broker.json` — statlocker.gg's embedded extraction of the
  game's `citadel_corrupted_*` data (from its `/items/broker` page bundle):
  excluded downsides per item, variance class per key (`full` ±15%,
  `rounded`, `fixed`), display labels, the penalty pool. The wiki doesn't
  carry these. The script aborts if the two sources disagree on a bonus —
  re-extract Data_Broker.json when that happens.

Corrupted items have **no icon of their own** — not on the wiki, not in the
game's asset bucket, not on statlocker. The game draws the normal icon in a
shared corrupted frame, which is `public/corruption/frame-corrupted.webp`.

`scripts/convert_items.py` holds `STAT_MAP` (game key → registry key). Three
conventions in the export that will silently corrupt numbers if missed:

- **Resist shred is stored as a negative resist** (`-8` means strip 8%).
- **`ReloadSpeedMultipler`** (sic) **is inverted** (`-10` means 10% faster).
- **A block containing `MaxStacks` describes per-stack values** in its `Main` list.
- **Ballistic Enchantment (`upgrade_bulletshredimbue`) is hand-overridden** after
  the generic pass: its hero (`WeaponPowerPerStack`) and non-hero
  (`WeaponPowerPerStackNonHero`, capped by `NonHeroStackLimit`) bonuses are two
  independent per-stack tracks in game, but neither entry sits inside a block
  carrying a literal `MaxStacks` key, so the generic detection misses both and
  would otherwise produce a single on/off toggle plus a flat non-hero stat. The
  override also re-maps the non-hero rate onto `weaponDamagePct`, not
  `weaponDamageVsNpcPct` the way `STAT_MAP` would: both stacks grant the same
  general weapon damage that applies to everything, a non-hero hit just earns
  less of it per stack — it is not a bonus restricted to damage dealt *to*
  non-heroes (confirmed against the user's own in-game knowledge, not the
  wiki's wording). The override lives right before `items.append(item)` —
  re-check it by hand if the wiki ever restructures this item's blocks.

Stats that cannot be mapped are kept per-item as display-only info rows rather
than dropped, so item cards still show the full in-game tooltip.

Keys deliberately **not** mapped to hero stats, because they do not apply to you:
`ImbuedTechPower` (goes to the imbued ability), `TechPowerReduction` (strips
spirit from the *enemy*), `BonusSpiritForChargedAbilities`.
