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

Stats that cannot be mapped are kept per-item as display-only info rows rather
than dropped, so item cards still show the full in-game tooltip.

Keys deliberately **not** mapped to hero stats, because they do not apply to you:
`ImbuedTechPower` (goes to the imbued ability), `TechPowerReduction` (strips
spirit from the *enemy*), `BonusSpiritForChargedAbilities`.
