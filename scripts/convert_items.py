"""Convert deadlock.wiki's Data:ItemCards.json into the Build Lab item model.

The wiki mirrors the game's own item data, so this is the authoritative source
for stats, component trees, activation types and which bonuses are conditional.

Stats are split four ways:
  * mapped, unconditional           -> item.stats
  * mapped, ConditionallyApplied    -> item.conditionalStats (gated by a toggle)
  * mapped, in a block with MaxStacks -> item.perStack (times the stack count)
  * everything else                 -> item.info[] (displayed verbatim)

Three game-data conventions worth knowing:
  * Resist shred is stored as a negative resist ("-8" means strip 8%).
  * ReloadSpeedMultipler is stored inverted ("-10" means reload 10% faster).
  * A block containing MaxStacks describes per-stack values in its Main list.
"""
import json, os, re, unicodedata
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, "Data_ItemCards.json")
OUT = os.path.join(ROOT, "data", "seed-items.json")
ICON_DIR = os.path.join(ROOT, "public", "items")

SLOT_TO_CATEGORY = {"Weapon": "Weapon", "Armor": "Vitality", "Tech": "Spirit"}

STAT_MAP = {
    # ---- weapon ----
    "BaseAttackDamagePercent": "weaponDamagePct",
    "BaseAttackDamagePercentBonus": "weaponDamagePct",
    "BaseAttackDamagePercentAtMaxDuration": "weaponDamagePct",
    "WeaponPower": "weaponDamagePct",
    "MaxWeaponPower": "weaponDamagePct",
    "LongRangeBonusWeaponPower": "weaponDamagePct",
    "CloseRangeBonusWeaponPower": "weaponDamagePct",
    "StationaryWeaponPower": "weaponDamagePct",
    "WeaponPowerWhileActivated": "weaponDamagePct",
    "WeaponPowerPerStack": "weaponDamagePct",
    "WeaponPowerPerKill": "weaponDamagePct",
    "WeaponPowerPerDeath": "weaponDamagePct",
    "BonusFireRate": "fireRatePct",
    # Trigger-gated fire rate under a pile of different names.
    "ActivatedFireRate": "fireRatePct",
    "FireRateBonus": "fireRatePct",
    "FervorFireRate": "fireRatePct",
    "AmbushBonusFireRate": "fireRatePct",
    "FireRateWhileSliding": "fireRatePct",
    "ActiveBonusFireRate": "fireRatePct",
    "BonusClipSizePercent": "ammoPct",
    "BonusClipSize": "ammoFlat",
    "TemporaryBonusClipSize": "ammoFlat",
    "BonusBulletSpeedPercent": "bulletVelocityPct",
    "BonusAttackRangePercent": "falloffRangePct",
    "HeadShotBonusDamage": "headshotDamagePct",
    "BulletLifestealPercent": "bulletLifestealPct",
    "BonusMeleeDamagePercent": "meleeDamagePct",
    "AmbushBonusMeleeDamage": "meleeDamagePct",
    "BonusHeavyMeleeDamage": "heavyMeleeDamagePct",
    "NonPlayerBonusWeaponPower": "weaponDamageVsNpcPct",
    "WeaponPowerPerStackNonHero": "weaponDamageVsNpcPct",
    "BulletsBonusMagicDamage": "bulletSpiritDamagePctOfBase",
    # ---- vitality ----
    "BonusHealth": "bonusHealthFlat",
    "MaxHealthLossPercent": "bonusHealthPct",
    "BonusHealthRegen": "healthRegenFlat",
    "OutOfCombatHealthRegen": "outOfCombatHealthRegen",
    "BulletResist": "bulletResistPct",
    "BulletResistBelowThreshold": "bulletResistPct",
    "BuffBulletResist": "bulletResistPct",
    "TechResist": "spiritResistPct",
    "TechResistBelowThreshold": "spiritResistPct",
    "BuffTechResist": "spiritResistPct",
    "TechArmorGain": "spiritResistPct",
    "MeleeResistPercent": "meleeResistPct",
    "StatusResistancePercent": "debuffResistPct",
    "FervorStatusResistancePercent": "debuffResistPct",
    "SlowResistancePercent": "slowResistPct",
    "CombatBarrier": "combatBarrierFlat",
    "GuardianWardCombatBarrier": "combatBarrierFlat",
    "VexBarrierCombatBarrier": "combatBarrierFlat",
    "Stamina": "staminaFlat",
    "StaminaCooldownReduction": "staminaRecoveryPct",
    "BonusMoveSpeed": "moveSpeedFlat",
    "FervorMovespeed": "moveSpeedFlat",
    "FloatMoveSpeed": "moveSpeedFlat",
    "FlyMoveSpeed": "moveSpeedFlat",
    "BuffMoveSpeedBonus": "moveSpeedFlat",
    "ActiveMoveSpeedPenalty": "moveSpeedFlat",
    "ActiveBonusMoveSpeed": "moveSpeedFlat",
    "BonusSprintSpeed": "sprintSpeedFlat",
    "HealAmpReceivePenaltyPercent": "healingReceivedPct",
    "NonPlayerBulletResist": "bulletResistVsNpcPct",
    # ---- spirit ----
    "TechPower": "spiritPowerFlat",
    "AmbushBonusTechPower": "spiritPowerFlat",
    "TechPowerGain": "spiritPowerFlat",
    "SpiritPower": "spiritPowerFlat",
    "BonusSpirit": "spiritPowerFlat",
    "SpiritPowerInnate": "spiritPowerFlat",
    # NOT mapped, deliberately:
    #   ImbuedTechPower     - spirit granted to the imbued ability, not to you
    #   TechPowerReduction  - strips spirit power from the enemy, not a self buff
    #   BonusSpiritForChargedAbilities - only applies to charged abilities
    "TechPowerPercent": "spiritPowerPct",
    "CooldownReduction": "cooldownReductionPct",
    "ItemCooldownReduction": "cooldownReductionPct",
    "CooldownReductionOnChargedAbilities": "cooldownReductionPct",
    "BonusAbilityDurationPercent": "abilityDurationPct",
    "TechRangeMultiplier": "abilityRangePct",
    "TechRangeMultiplierBuff": "abilityRangePct",
    "BonusAbilityCharges": "chargesFlat",
    "AbilityLifestealPercentHero": "spiritLifestealPct",
    "BonusSpiritLifesteal": "spiritLifestealPct",
    "MagicIncreasePerStack": "spiritAmpPct",
    # Imbue-only keys. These never apply globally - see IMBUED_KEYS below.
    "ImbuedTechPower": "spiritPowerFlat",
    "ImbuedCooldownReduction": "cooldownReductionPct",
    "TechDamagePercent": "abilityDamagePct",
    # ---- chance-based effects ----
    "ProcChance": "procChancePct",
    "CritDamagePercent": "procWeaponDamagePct",
    "ProcBaseAttackDamagePercent": "procWeaponDamagePct",
    "DamagePerChain": "procSpiritDamageFlat",
    # ---- ricochet ----
    "RicochetDamagePercent": "ricochetDamagePct",
    "RicochetTargetsTooltipOnly": "ricochetTargets",
}

# Values the game stores with the opposite sign to the way we use them.
INVERTED = {"ReloadSpeedMultipler": "reloadSpeedPct"}

# Stats whose value is per stack even though their block does not carry the
# standard MaxStacks key.
PER_STACK_MAP = {
    "BulletResistPerStack": "bulletResistPct",
    "FireRatePerKill": "fireRatePct",
}

SHRED_MAP = {
    "BulletArmorReduction": "bullet",
    "BulletResistReduction": "bullet",
    "TechArmorDamageReduction": "spirit",
    "MagicResistReduction": "spirit",
}

# Per-spirit scaling the ItemCards export omits. Sourced from the workbook,
# whose E35 reads ((0.25 + spirit*0.0049) * base gun damage) * spirit amp.
# Stats that describe one ability rather than the hero. On an imbue item they
# are scoped to whichever ability you imbue; Compress Cooldown does not reduce
# every cooldown, it reduces one. Anything in an "Innate" block stays global,
# which is how Mercurial Magnum keeps its flat +7 spirit power.
IMBUED_KEYS = {
    "spiritPowerFlat",
    "cooldownReductionPct",
    "abilityDurationPct",
    "abilityRangePct",
    "chargesFlat",
    "abilityDamagePct",
    "abilityBonusDamage",
}

# Quicksilver Reload and Mercurial Magnum both read "your imbued ability charges
# up over time with bonus spirit damage". The export carries that as a bare
# `Damage`, which on other items means something else entirely, so it is opted
# in per item rather than mapped globally.
IMBUED_BONUS_DAMAGE = {"upgrade_quick_silver": 44, "upgrade_ethereal_bullets": 60}

# Stack caps the export omits. Confirmed in game.
STACK_CAPS = {
    "glass-cannon": 8,
}

SCALING_OVERRIDES = {}

# The export's per-entry "Scale" field gives the per-point coefficient for
# stats that scale with a resource beyond their flat base — Mercurial Magnum's
# 0.49%-per-spirit bonus (previously hand-copied from the workbook, now read
# straight from the data) is one of many. "spirit" scales with spirit power;
# "power_increase" is the export's internal name for boon (hero level)
# scaling, confirmed against deadlock.wiki's own rendering ("+10 [Boon]x0.8%
# Weapon Damage" on Cultist Sacrifice).
SCALE_KIND = {"spirit": "spirit", "power_increase": "boon"}
SHRED_SCALE_KEY = {"bullet": "bulletPerSpirit", "spirit": "spiritPerSpirit"}

# Armor Piercing Rounds' ProcChance means "chance to ignore Bullet Resistance
# entirely", not "chance of bonus damage" like every other ProcChance item -
# the export gives no way to tell those apart, so it is opted in per item.
IGNORES_BULLET_RESIST = {"upgrade_aprounds"}

# The export marks a stat as conditional with per-entry "UsageFlags", but it
# is inconsistent about it: an entire block typed "Active" (you must press
# the item) or gated behind a "ChargeUp" (Quicksilver Reload/Mercurial
# Magnum's charge-then-consume kit) is conditional by construction even when
# none of its individual entries carry the flag - confirmed against Vampiric
# Burst's fire rate and Mercurial Magnum's bonus spirit damage, both of which
# require the bound ability to be triggered.
#
# Healing Tempo is the one item where even that does not save us: its reward
# block has no Type at all, and its own tooltip spells out the condition
# ("Does not apply on innate Regen or passive Bullet/Spirit Lifesteals") -
# lifesteal is not Healing in this game, so the fire rate/move speed it
# grants is opted in here rather than guessed at from a heuristic.
FORCE_CONDITIONAL_ITEMS = {"upgrade_healbuff"}

CONDITION_LABELS = [
    ("LongRangeBonusWeaponPower", "Beyond minimum range"),
    ("CloseRangeBonusWeaponPower", "Within close range"),
    ("StationaryWeaponPower", "Standing still"),
    ("WeaponPowerWhileActivated", "Active effect running"),
    ("ActiveBonus", "Active effect running"),
    ("PerKill", "Stacks held"),
    ("PerDeath", "Stacks held"),
    ("PerStack", "Stacks held"),
    ("NonPlayer", "Against non-heroes"),
    ("HealAmp", "Debuff applied to target"),
    ("Reduction", "Debuff applied to target"),
    ("Barrier", "Barrier up"),
    ("Slow", "Target slowed"),
]


def slugify(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = s.lower().replace("'", "").replace("\u2019", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def strip_html(text):
    if not text:
        return None
    # The game embeds localisation directives like {g:citadel_inline_attribute:'X'}.
    text = re.sub(r"\{g:[^}]*'([^']+)'\}", r"\1 ", text)
    text = re.sub(r"\{[^}]*\}", "", text)
    text = text.replace("<br>", " ")
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&")
    return re.sub(r"\s+", " ", text).strip() or None


def parse_value(raw):
    if raw is None:
        return None
    if isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    m = re.match(r"^(-?\d+(?:\.\d+)?)", str(raw).strip())
    return float(m.group(1)) if m else None


def condition_label(keys, activation="Passive", windowed=False):
    for needle, label in CONDITION_LABELS:
        if any(needle in k for k in keys):
            return label
    # An item you have to press only grants its bonus while the effect is up.
    if activation != "Passive":
        return "Active effect running"
    # A passive whose bonus sits behind a cooldown or a duration is a buff you
    # have to trigger, which "condition met" does not convey.
    if windowed:
        return "Buff window active"
    return "Condition met"


def add(bag, key, value):
    bag[key] = round(bag.get(key, 0) + value, 4)


def main():
    raw = json.load(open(SRC, encoding="utf-8"))
    # Disabled and unreleased entries are dead weight in the shop and in admin.
    # Street Brawl-only items are excluded too: that mode has its own shop and
    # these can't be bought in Standard or Ranked, so recommending them there
    # would send the player to a shop that doesn't have them.
    records = [
        v
        for v in raw.values()
        if v.get("Name")
        and v.get("Cost") is not None
        and not v.get("IsDisabled")
        and not v.get("StreetBrawl")
    ]

    # Two items ship under the same name (an active "Silencer" and a disabled
    # leftover), so fall back to the game key to keep slugs unique.
    key_to_slug, seen = {}, {}
    for record in sorted(records, key=lambda r: (bool(r.get("IsDisabled")), r["Key"])):
        slug = slugify(record["Name"])
        if slug in seen:
            slug = slugify(record["Key"].replace("upgrade_", ""))
            if slug in seen:
                slug = f'{slug}-{len(seen)}'
        seen[slug] = record["Key"]
        key_to_slug[record["Key"]] = slug

    unmapped = Counter()
    items = []

    for order, rec in enumerate(
        sorted(records, key=lambda r: (r["Slot"], r["Cost"], r["Name"]))
    ):
        name = rec["Name"]
        stats, conditional_stats, per_stack = {}, {}, {}
        imbued_stats = {}
        per_spirit, per_boon = {}, {}
        # (skey, "spirit"|"boon", coefficient, was_conditional) - resolved once
        # the item's full conditional_stats is known; see the loop below.
        scale_candidates = []
        shred, per_stack_shred = {}, {}
        conditional_is_proc = False
        conditional_is_held = False
        shred_is_proc = False
        stacks_are_proc = False
        damage_multiplier = None
        info_blocks = []
        condition_keys = []
        max_stacks = None

        for block_name in ("Info1", "Info2", "Info3", "Info4"):
            block = rec.get(block_name)
            if not block:
                continue

            entries = [(lst, s) for lst in ("Main", "Alt") for s in (block.get(lst) or [])]
            block_has_cooldown = block.get("Cooldown") is not None
            block_is_innate = (block.get("Type") or "") == "Innate"
            # See FORCE_CONDITIONAL_ITEMS: a block typed "Active", one gated
            # behind a ChargeUp, or an item opted in by hand is conditional
            # even when the export leaves UsageFlags off every entry.
            block_is_active = (block.get("Type") or "") == "Active"
            block_is_charge_gated = block.get("ChargeUp") is not None
            block_forced_conditional = (
                rec["Key"] in FORCE_CONDITIONAL_ITEMS and not block_is_innate
            )
            scoped_to_imbue = bool(rec.get("IsImbue")) and not block_is_innate
            block_stacks = next(
                (
                    parse_value(s.get("Value"))
                    for _, s in entries
                    if s["Key"] in ("MaxStacks", "MaxArmorStacks")
                ),
                None,
            )
            # A conditional bonus is a window you have to open rather than a
            # state you hold when its block carries its own cooldown or a finite
            # duration, or when the item is one you have to press at all.
            block_has_window = (
                block_has_cooldown
                or block_is_active
                or block_is_charge_gated
                or block_forced_conditional
                or (rec.get("Activation") or "Passive") != "Passive"
                or any(
                    s["Key"].endswith("Duration") or s["Key"] == "DamageWindow"
                    for _, s in entries
                )
            )
            if block_stacks:
                max_stacks = int(block_stacks)

            display_rows = []
            for lst, entry in entries:
                gkey = entry["Key"]
                value = parse_value(entry.get("Value"))
                scale = entry.get("Scale")
                scale_value = scale.get("Value") if scale else None
                scale_kind = SCALE_KIND.get(scale.get("Type")) if scale else None
                is_conditional = (
                    bool(entry.get("UsageFlags"))
                    or block_is_active
                    or block_is_charge_gated
                    or block_forced_conditional
                )
                # Within a stacking block, the headline numbers are per-stack.
                is_per_stack = bool(block_stacks) and lst == "Main"
                if gkey.startswith("Stacking"):
                    gkey = gkey[len("Stacking") :]
                    is_per_stack = True

                if gkey in PER_STACK_MAP and value is not None:
                    add(per_stack, PER_STACK_MAP[gkey], value)
                    if is_conditional and block_has_window:
                        stacks_are_proc = True
                    continue

                if gkey in SHRED_MAP and value is not None:
                    target = per_stack_shred if is_per_stack else shred
                    add(target, SHRED_MAP[gkey], abs(value) / 100)
                    # Per-stack shred has nowhere to carry a spirit coefficient
                    # too (ShredSpec has no perStack-and-perSpirit combo).
                    if scale_kind == "spirit" and scale_value is not None and not is_per_stack:
                        add(shred, SHRED_SCALE_KEY[SHRED_MAP[gkey]], abs(scale_value) / 100)
                    if is_conditional and not is_per_stack:
                        condition_keys.append(gkey)
                        if block_has_window:
                            shred_is_proc = True
                    continue

                if gkey == "OutgoingDamagePenaltyPercent" and value is not None:
                    if not is_conditional:
                        # An unconditional penalty is on *you* (Golden Goose Egg).
                        # The conditional version is a debuff you put on an enemy,
                        # which does not change your own damage.
                        damage_multiplier = round(1 + value / 100, 4)
                        continue

                if gkey in INVERTED and value is not None:
                    skey = INVERTED[gkey]
                    bag = per_stack if is_per_stack else (conditional_stats if is_conditional else stats)
                    add(bag, skey, -value)
                    if is_conditional and not is_per_stack:
                        condition_keys.append(gkey)
                        if block_has_window:
                            conditional_is_proc = True
                        else:
                            conditional_is_held = True
                    continue

                if gkey in STAT_MAP and value is not None:
                    skey = STAT_MAP[gkey]
                    if scoped_to_imbue and skey in IMBUED_KEYS:
                        add(imbued_stats, skey, value)
                        continue
                    if is_per_stack and is_conditional and block_has_window:
                        stacks_are_proc = True
                    bag = per_stack if is_per_stack else (conditional_stats if is_conditional else stats)
                    add(bag, skey, value)
                    # Per-stack has no perSpirit/perBoon counterpart to fold
                    # into (Item only carries one flat perSpirit/perBoon bag,
                    # not one scoped per stack), so leave those unhandled -
                    # none of the wiki's Scale entries land on one today.
                    if scale_kind and scale_value is not None and not is_per_stack:
                        scale_candidates.append((skey, scale_kind, scale_value, is_conditional))
                    if is_conditional and not is_per_stack:
                        condition_keys.append(gkey)
                        if block_has_window:
                            conditional_is_proc = True
                        else:
                            conditional_is_held = True
                    continue

                # Quicksilver Reload and Mercurial Magnum's imbued
                # charge-then-consume bonus (see IMBUED_BONUS_DAMAGE) also
                # scales with spirit power; the base amount is opted in by
                # hand below since "Damage" means something different on
                # almost every other item, but the coefficient can be read
                # straight off this entry once we know it applies here.
                if (
                    gkey == "Damage"
                    and rec["Key"] in IMBUED_BONUS_DAMAGE
                    and scale_kind == "spirit"
                    and scale_value is not None
                ):
                    add(imbued_stats, "abilityBonusDamagePerSpirit", scale_value)

                if gkey not in ("MaxStacks", "MaxArmorStacks"):
                    unmapped[gkey] += 1
                display_rows.append(
                    {
                        "key": gkey,
                        "value": entry.get("Value"),
                        "type": entry.get("Type"),
                        "conditional": is_conditional,
                        "emphasis": lst == "Main",
                        **({"scale": {"value": scale_value, "kind": scale_kind}} if scale else {}),
                    }
                )

            if display_rows or block.get("Cooldown"):
                info_blocks.append(
                    {
                        "type": block.get("Type") or "Passive",
                        "cooldown": block.get("Cooldown"),
                        "chargeUp": block.get("ChargeUp"),
                        "rows": display_rows,
                    }
                )

        # Item.perSpirit/perBoon are one flat bag gating every key in them the
        # same way (r.contributing in engine.ts) - fine when a scaled key's own
        # base value shares that gate, but wrong if the item also carries some
        # *other*, unrelated conditional bonus (e.g. Headhunter's unconditional
        # headshot damage sits next to a separately-gated move speed proc): the
        # scaling would then silently disable itself with the wrong toggle. Only
        # fold a candidate in when it can't be misgated - its own base is
        # conditional (same toggle either way) or the item has no other
        # conditional stat to collide with.
        has_other_conditional = bool(conditional_stats)
        for skey, kind, sval, was_conditional in scale_candidates:
            if was_conditional or not has_other_conditional:
                add(per_boon if kind == "boon" else per_spirit, skey, sval)
            else:
                print(
                    f"  ! {name}: skipping {kind} scaling on {skey} - its base is "
                    "unconditional but the item has an unrelated conditional bonus"
                )

        item = {
            "slug": key_to_slug[rec["Key"]],
            "gameKey": rec["Key"],
            "name": name,
            "category": SLOT_TO_CATEGORY[rec["Slot"]],
            "cost": rec["Cost"],
            "tier": rec["Tier"],
            "activation": rec.get("Activation") or "Passive",
            # Keep an icon that is already downloaded, so re-running this
            # script on its own does not blank the whole catalogue.
            "iconUrl": (
                f"/items/{key_to_slug[rec['Key']]}.png"
                if os.path.exists(
                    os.path.join(ICON_DIR, f"{key_to_slug[rec['Key']]}.png")
                )
                else None
            ),
            "description": strip_html(rec.get("Description")),
            "components": [
                key_to_slug[c] for c in (rec.get("Components") or []) if c in key_to_slug
            ],
            "shopFilters": rec.get("ShopFilters") or [],
            "isImbue": bool(rec.get("IsImbue")),
            "stats": stats,
            "enabled": not rec.get("IsDisabled"),
            "sortOrder": order,
        }

        if rec["Key"] in IMBUED_BONUS_DAMAGE:
            add(imbued_stats, "abilityBonusDamage", IMBUED_BONUS_DAMAGE[rec["Key"]])
        if rec["Key"] in IGNORES_BULLET_RESIST:
            item["ignoresBulletResist"] = True
        if imbued_stats:
            item["imbuedStats"] = imbued_stats
        if conditional_stats:
            item["conditionalStats"] = conditional_stats
            item["conditional"] = {
                "label": condition_label(
                    condition_keys,
                    rec.get("Activation") or "Passive",
                    conditional_is_proc and not conditional_is_held,
                ),
                # A bonus gated behind its own cooldown is a short proc window,
                # so it is off until you say otherwise. One you can simply hold
                # (Spiritual Overflow, Sharpshooter's range bonus) starts on.
                "defaultActive": conditional_is_held or not conditional_is_proc,
            }
        if per_spirit:
            item["perSpirit"] = per_spirit
        if per_boon:
            item["perBoon"] = per_boon
        if per_stack or per_stack_shred:
            if per_stack:
                item["perStack"] = per_stack
            capped = STACK_CAPS.get(item["slug"])
            if capped:
                item["maxStacks"] = capped
            elif max_stacks:
                item["maxStacks"] = max_stacks
            else:
                # The export carries no cap for per-kill style stacks. Ten is a
                # workable ceiling; add the real one to STACK_CAPS when known.
                item["maxStacks"] = 10
                item["notes"] = (
                    (item.get("notes") + " ") if item.get("notes") else ""
                ) + "The game data gives no stack cap for this item; 10 is an assumption."
            item["defaultStacks"] = item["maxStacks"]
            item["stackLabel"] = "Stacks"
            # Stacks always have to be earned, so they get the same gate as any
            # other trigger. The stack slider then says how many you are holding
            # and the toggle says whether you are holding any at all.
            item.setdefault("conditional", {"label": "Stacks held", "defaultActive": False})
            _ = stacks_are_proc
        if shred_is_proc:
            item["defaultShredActive"] = False
        if shred or per_stack_shred:
            merged = dict(shred)
            if per_stack_shred.get("bullet"):
                merged["perStackBullet"] = per_stack_shred["bullet"]
            if per_stack_shred.get("spirit"):
                merged["perStackSpirit"] = per_stack_shred["spirit"]
            item["shred"] = merged
        if damage_multiplier is not None:
            item["damageMultiplier"] = damage_multiplier
        for key, value in SCALING_OVERRIDES.get(item["slug"], {}).items():
            item[key] = {**item.get(key, {}), **value}

        # Ballistic Enchantment tracks two independent stack counts - hero
        # hits (WeaponPowerPerStack) and non-hero hits (WeaponPowerPerStack-
        # NonHero, capped by NonHeroStackLimit) - but neither entry sits in a
        # block carrying the literal MaxStacks key the generic per-stack
        # detection above looks for, so both land as a single on/off toggle
        # and a flat stat instead. Confirmed against the raw export and
        # deadlock.wiki/Ballistic_Enchantment. The hero cap isn't in the data
        # at all; 6 mirrors the enemy team size, the practical ceiling.
        #
        # Both tracks grant the *same* general weapon damage (it applies to
        # everything you shoot afterward, hero or not) - a non-hero hit just
        # earns a smaller bonus per stack than a hero hit does. This is not
        # "Weapon Damage vs NPCs" (a bonus that only counts while *hitting* a
        # non-hero, like Monster Rounds/Cultist Sacrifice); the wiki export's
        # STAT_MAP entry for WeaponPowerPerStackNonHero is misleading here,
        # confirmed against the user's own in-game knowledge of the item.
        if rec["Key"] == "upgrade_bulletshredimbue":
            hero_pct = conditional_stats.pop("weaponDamagePct", 20.0)
            non_hero_pct = stats.pop("weaponDamageVsNpcPct", 5.0)
            item["stats"] = stats
            if conditional_stats:
                item["conditionalStats"] = conditional_stats
            else:
                item.pop("conditionalStats", None)
                item.pop("conditional", None)
            item["perStack"] = {"weaponDamagePct": hero_pct}
            item["maxStacks"] = 6
            item["defaultStacks"] = 6
            item["stackLabel"] = "Hero stacks"
            item["perStackSecondary"] = {"weaponDamagePct": non_hero_pct}
            item["maxStacksSecondary"] = 8
            item["defaultStacksSecondary"] = 8
            item["stackLabelSecondary"] = "Non-hero stacks"
            # Stacks always have to be earned - same convention as every
            # other stacking item (see seed.test.ts "never assumes stacks
            # are already held").
            item["conditional"] = {"label": "Stacks held", "defaultActive": False}

        if info_blocks:
            item["info"] = info_blocks

        items.append(item)

    json.dump(items, open(OUT, "w", encoding="utf-8"), indent=2, ensure_ascii=False)

    print(f"items: {len(items)}")
    print("by category:", dict(Counter(i["category"] for i in items)))
    print("by tier:", dict(sorted(Counter(i["tier"] for i in items).items())))
    print("engine stats:", sum(1 for i in items if i["stats"]))
    print("conditional:", sum(1 for i in items if i.get("conditionalStats")))
    print("stacking:", sum(1 for i in items if i.get("maxStacks")))
    print("shred:", sum(1 for i in items if i.get("shred")))
    print("damage multiplier:", [(i["slug"], i["damageMultiplier"]) for i in items if i.get("damageMultiplier")])
    print("components:", sum(1 for i in items if i["components"]))
    print("descriptions:", sum(1 for i in items if i["description"]))
    print("\nstill display-only (top 15):")
    for k, c in unmapped.most_common(15):
        print(f"  {c:4d}  {k}")


if __name__ == "__main__":
    main()
