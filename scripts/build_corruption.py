"""Write each Tier 3/4 item's Broker corruption into data/seed-items.json.

Run after fetch_wiki_data.py whenever the Broker's numbers change:

    python scripts/fetch_wiki_data.py      # refresh Data_ItemCards.json
    python scripts/build_corruption.py     # rewrite item.corruption only
    npm run db:sync-seed                   # push to the database

Only the `corruption` field of each seed item is touched - everything else
(hand-curated gating, notes, slugs) is left exactly as it is, so this is safe
to run without a full convert_items.py re-import.

Two sources:
  * Data_ItemCards.json (deadlock.wiki) - `CorruptedUpgrades`, a per-key
    delta on top of the item's own raw keys. This is what the engine math
    comes from.
  * Data_Broker.json (statlocker.gg's embedded extraction of the game's
    `citadel_corrupted_*` data) - which downsides each item can't roll, which
    keys are exempt from the +/-15% roll (stack caps, charges, target counts),
    and human-readable labels. Its per-key bonuses match the wiki's exactly
    (checked below), so the two can't drift silently.

How a delta reaches the engine: the item is converted by convert_items.py's
own `convert_record` twice - once as-is, once with a single corrupted key's
delta folded into the raw value - and the difference between the two is that
key's contribution. That routes every key exactly the way the base value is
routed (per-stack, conditional, shred, proc, imbue-scoped, per-spirit...)
without a second, parallel key map to keep in sync.
"""
import copy, json, os, re, sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from convert_items import convert_record  # noqa: E402

CARDS = os.path.join(HERE, "Data_ItemCards.json")
BROKER = os.path.join(HERE, "Data_Broker.json")
SEED = os.path.join(ROOT, "data", "seed-items.json")

BAGS = (
    "stats",
    "conditionalStats",
    "perStack",
    "perStackSecondary",
    "imbuedStats",
    "perSpirit",
    "perBoon",
    "shred",
)
MOVABLE = ("stats", "conditionalStats")

# The seed's gating was confirmed by hand where the export's UsageFlags are
# wrong or have since changed (see convert_items.py), and a corrupted key has
# to land wherever the seed keeps that key's base value. Most of that is
# inferred automatically (see `rehome`); this is for the case it can't infer
# - one stat key split across two bags.
BAG_OVERRIDES = {
    # 10% innate weapon damage in `stats`, 60% long-range bonus gated in
    # `conditionalStats` - both are weaponDamagePct.
    ("upgrade_sharpshooter", "LongRangeBonusWeaponPower"): "conditionalStats",
}

# Keys the item model carries outside any raw entry.
SPECIAL = {
    # convert_items.py hard-codes Ballistic Enchantment's non-hero stack cap
    # (8) since no raw entry is a literal MaxStacks; its corruption raises it.
    ("upgrade_bulletshredimbue", "NonHeroStackLimit"): "maxStacksSecondary",
}


class Slugs(dict):
    """convert_record only needs a slug for the record itself."""

    def __missing__(self, key):
        return key


def parse_num(raw):
    m = re.match(r"^(-?\d+(?:\.\d+)?)(.*)$", str(raw).strip())
    return (float(m.group(1)), m.group(2)) if m else (None, "")


def add_raw(raw, delta):
    """Adds a numeric delta to a raw export value, keeping its unit suffix."""
    value, suffix = parse_num(raw)
    d, _ = parse_num(delta)
    if value is None or d is None:
        return raw
    total = round(value + d, 4)
    if isinstance(raw, (int, float)) and not suffix:
        return total
    return f"{total:g}{suffix}"


def with_delta(rec, key, delta):
    """A copy of `rec` with one corrupted key applied, or None if no raw entry carries it."""
    out = copy.deepcopy(rec)
    hit = False
    for name in ("Info1", "Info2", "Info3", "Info4"):
        block = out.get(name)
        if not block:
            continue
        if key == "AbilityCooldown" and block.get("Cooldown"):
            block["Cooldown"] = add_raw(block["Cooldown"], delta)
            hit = True
        if key == "AbilityChargeUpTime" and block.get("ChargeUp"):
            block["ChargeUp"] = add_raw(block["ChargeUp"], delta)
            hit = True
        for lst in ("Main", "Alt"):
            for entry in block.get(lst) or []:
                if entry["Key"] in (key, f"Stacking{key}"):
                    entry["Value"] = add_raw(entry.get("Value"), delta)
                    hit = True
    return out if hit else None


def numeric_diff(a, b):
    """{field: delta} for every numeric field that differs between two flat dicts."""
    out = {}
    for k in set(a or {}) | set(b or {}):
        va, vb = (a or {}).get(k, 0), (b or {}).get(k, 0)
        if isinstance(va, (int, float)) and isinstance(vb, (int, float)):
            d = round(vb - va, 4)
            if d:
                out[k] = d
    return out


def rehome(bag, skey, seed_item, game_key, raw_key):
    """Which bag of the *seed* item a corrupted delta belongs in."""
    override = BAG_OVERRIDES.get((game_key, raw_key))
    if override:
        return override
    if bag not in MOVABLE or skey in (seed_item.get(bag) or {}):
        return bag
    holders = [b for b in MOVABLE if skey in (seed_item.get(b) or {})]
    return holders[0] if len(holders) == 1 else bag


def merge(target, bag, skey, delta):
    target.setdefault(bag, {})
    target[bag][skey] = round(target[bag].get(skey, 0) + delta, 4)


def main():
    cards = json.load(open(CARDS, encoding="utf-8"))
    broker = json.load(open(BROKER, encoding="utf-8"))
    seed = json.load(open(SEED, encoding="utf-8"))

    records = {v["Key"]: v for v in cards.values() if isinstance(v, dict) and v.get("Key")}
    broker_items = {i["className"]: i for i in broker["items"]}
    slugs = Slugs()

    display_only = Counter()
    written = 0
    for item in seed:
        item.pop("corruption", None)
        if item.get("tier") not in (3, 4):
            continue
        rec = records.get(item.get("gameKey"))
        upgrades = (rec or {}).get("CorruptedUpgrades")
        info = broker_items.get(item.get("gameKey"))
        if not upgrades or not info:
            print(f"  ! {item['name']}: no corruption data (wiki: {bool(upgrades)}, broker: {bool(info)})")
            continue

        variance = {s["property"]: s["variance"] for s in info["stats"]}
        for s in info["stats"]:
            wiki, _ = parse_num(upgrades.get(s["property"]))
            if s["bonus"] is not None and (wiki is None or abs(wiki - s["bonus"]) > 1e-6):
                raise SystemExit(
                    f"{item['name']}.{s['property']}: wiki says {upgrades.get(s['property'])}, "
                    f"broker extraction says {s['bonus']} - refresh Data_Broker.json"
                )

        base = convert_record(rec, slugs, quiet=True)
        corruption = {"excludedPenalties": sorted(info["excludedPenalties"])}
        fixed = {}

        for key, raw_delta in upgrades.items():
            delta, _ = parse_num(raw_delta)
            special = SPECIAL.get((rec["Key"], key))
            if special:
                field = "maxStacksSecondaryDelta" if special == "maxStacksSecondary" else "maxStacksDelta"
                corruption[field] = corruption.get(field, 0) + int(delta)
                continue
            patched = with_delta(rec, key, raw_delta)
            if patched is None:
                display_only[key] += 1
                continue
            after = convert_record(patched, slugs, quiet=True)
            moved = False
            if after.get("maxStacks") != base.get("maxStacks") and item.get("maxStacks"):
                corruption["maxStacksDelta"] = corruption.get("maxStacksDelta", 0) + (
                    after["maxStacks"] - base["maxStacks"]
                )
                moved = True
            # Full-variance deltas roll +/-15% with the build's upgrade roll;
            # "fixed"/"rounded" ones (charges, targets, stack caps) don't.
            target = corruption if variance.get(key, "full") == "full" else fixed
            for bag in BAGS:
                for skey, d in numeric_diff(base.get(bag), after.get(bag)).items():
                    merge(target, rehome(bag, skey, item, rec["Key"], key), skey, d)
                    moved = True
            if not moved:
                display_only[key] += 1

        if fixed:
            corruption["fixed"] = fixed
        corruption["rows"] = [
            {
                "key": s["property"],
                "label": s["label"],
                "unit": s["unit"],
                "base": s["base"],
                "bonus": s["bonus"],
                "variance": s["variance"],
            }
            for s in info["stats"]
            if s["bonus"] is not None
        ]
        item["corruption"] = corruption
        written += 1

    # Same format convert_items.py writes, so a diff shows only real changes.
    json.dump(seed, open(SEED, "w", encoding="utf-8", newline="\n"), indent=2, ensure_ascii=False)
    print(f"corruption written for {written} items")
    print("display-only corrupted keys (the engine doesn't model the base either):")
    for key, count in display_only.most_common(20):
        print(f"  {count:4d}  {key}")


if __name__ == "__main__":
    main()
