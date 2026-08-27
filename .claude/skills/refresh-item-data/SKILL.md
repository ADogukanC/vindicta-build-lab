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
python scripts/fetch_icons.py
npm test        # seed.test.ts fails on unmapped stats, bad components, missing icons
```

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
