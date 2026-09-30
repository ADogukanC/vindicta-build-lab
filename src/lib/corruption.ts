import { addStats, type StatBag } from "./stats";
import type { BuildItem, CorruptionBags, CorruptionRoll, Item, ShredSpec } from "./types";

export type { CorruptionRoll } from "./types";

/**
 * The Broker: arrives at 30:00±2:00, restocks every 15:00, and corrupts one
 * held Tier 3 or 4 item for free — a much stronger item (`Item.corruption`,
 * generated per item by scripts/build_corruption.py from deadlock.wiki's
 * `CorruptedUpgrades`) plus one random downside from this shared pool.
 *
 * Two independent chance mechanics, both from the game's own convars
 * (`citadel_corrupted_*`, via statlocker.gg's extraction — see
 * scripts/Data_Broker.json):
 *  - **Which downside**: uniform over the pool minus the item's exclusions
 *    (every penalty has weight 1), so 1 in 11 = 9.1% for most items.
 *  - **How strong**: each corrupted *upgrade* rolls ±15% of its bonus (not
 *    of the whole value — Spellslinger's 11% → 18% fire rate lands on
 *    17–19%, not 15–21%), and the *downside* rolls ±15% of its own value.
 *    Stack caps and a few other counts round to whole numbers; charges,
 *    ricochet targets and a handful more never roll at all (`fixed`).
 */
const ROLL_VARIANCE = 0.15;

/** Multiplier on the corruption *bonus*: low roll = the smallest upgrade the game can give. */
export const UPGRADE_ROLL_MULTIPLIER: Record<CorruptionRoll, number> = {
  low: 1 - ROLL_VARIANCE,
  average: 1,
  high: 1 + ROLL_VARIANCE,
};

/** Multiplier on the downside: low roll = the mildest penalty, high = the harshest. */
export const DOWNSIDE_ROLL_MULTIPLIER: Record<CorruptionRoll, number> = {
  low: 1 - ROLL_VARIANCE,
  average: 1,
  high: 1 + ROLL_VARIANCE,
};

export const CORRUPTION_ROLLS: CorruptionRoll[] = ["low", "average", "high"];

export interface CorruptionPenalty {
  id: string;
  label: string;
  tier3: StatBag;
  tier4: StatBag;
}

/**
 * The game's penalty pool, `citadel_corrupted_penalty_*`. Tech Range also
 * shrinks ability radius by the same amount, which the engine has no stat
 * for (nor does it for Ability Range's own effect on damage).
 */
export const CORRUPTION_PENALTIES: CorruptionPenalty[] = [
  {
    id: "TechCooldown",
    label: "Ability Cooldown Reduction",
    tier3: { cooldownReductionPct: -13 },
    tier4: { cooldownReductionPct: -17 },
  },
  {
    id: "TechRange",
    label: "Ability Range and Radius",
    tier3: { abilityRangePct: -20 },
    tier4: { abilityRangePct: -25 },
  },
  {
    id: "Stamina",
    label: "Stamina",
    tier3: { staminaFlat: -1, staminaRecoveryPct: -18 },
    tier4: { staminaFlat: -1, staminaRecoveryPct: -24 },
  },
  {
    id: "MoveSpeed",
    label: "Move Speed",
    tier3: { moveSpeedFlat: -2 },
    tier4: { moveSpeedFlat: -2.75 },
  },
  {
    id: "FireRate",
    label: "Fire Rate",
    tier3: { fireRatePct: -20 },
    tier4: { fireRatePct: -25 },
  },
  {
    id: "TechDuration",
    label: "Ability Duration",
    tier3: { abilityDurationPct: -15 },
    tier4: { abilityDurationPct: -20 },
  },
  {
    id: "TechPower",
    label: "Spirit Power",
    tier3: { spiritPowerFlat: -30 },
    tier4: { spiritPowerFlat: -45 },
  },
  {
    id: "WeaponDamage",
    label: "Weapon Damage",
    tier3: { weaponDamagePct: -40 },
    tier4: { weaponDamagePct: -55 },
  },
  {
    id: "Health",
    label: "Max Health",
    tier3: { bonusHealthFlat: -350 },
    tier4: { bonusHealthFlat: -550 },
  },
  {
    id: "BulletResist",
    label: "Bullet Resist",
    tier3: { bulletResistPct: -14, meleeResistPct: -14 },
    tier4: { bulletResistPct: -18, meleeResistPct: -18 },
  },
  {
    id: "TechResist",
    label: "Spirit Resist",
    tier3: { spiritResistPct: -14 },
    tier4: { spiritResistPct: -18 },
  },
];

export const CORRUPTION_PENALTY_BY_ID: Record<string, CorruptionPenalty> = Object.fromEntries(
  CORRUPTION_PENALTIES.map((p) => [p.id, p]),
);

/** The only tiers the Broker can corrupt — not Tier 1/2, and no Street Brawl legendaries. */
export const CORRUPTIBLE_TIERS = [3, 4];

export function isCorruptible(item: Pick<Item, "tier" | "corruption">): boolean {
  return CORRUPTIBLE_TIERS.includes(item.tier) && Boolean(item.corruption);
}

/** Downsides a given item can roll, in pool order. Each is equally likely. */
export function availableDownsides(item: Pick<Item, "corruption">): CorruptionPenalty[] {
  const excluded = new Set(item.corruption?.excludedPenalties ?? []);
  return CORRUPTION_PENALTIES.filter((p) => !excluded.has(p.id));
}

export function downsideStats(item: Pick<Item, "tier">, penalty: CorruptionPenalty): StatBag {
  return item.tier >= 4 ? penalty.tier4 : penalty.tier3;
}

type RollEntry = Pick<BuildItem, "corrupted" | "corruptionUpgradeRoll">;

/** The stack cap actually in effect — the game rounds a rolled cap to a whole stack. */
export function corruptedMaxStacks(item: Item, entry: RollEntry): number {
  const base = item.maxStacks ?? 0;
  const delta = item.corruption?.maxStacksDelta;
  if (!entry.corrupted || !delta) return base;
  return Math.round(base + delta * UPGRADE_ROLL_MULTIPLIER[entry.corruptionUpgradeRoll ?? "average"]);
}

export function corruptedMaxStacksSecondary(item: Item, entry: RollEntry): number {
  const base = item.maxStacksSecondary ?? 0;
  const delta = item.corruption?.maxStacksSecondaryDelta;
  if (!entry.corrupted || !delta) return base;
  return Math.round(base + delta * UPGRADE_ROLL_MULTIPLIER[entry.corruptionUpgradeRoll ?? "average"]);
}

const STAT_BAGS = [
  "stats",
  "conditionalStats",
  "perStack",
  "perStackSecondary",
  "imbuedStats",
  "perSpirit",
  "perBoon",
] as const;

function addShred(base: ShredSpec | undefined, delta: ShredSpec | undefined, mul: number) {
  if (!delta) return base;
  const out: ShredSpec = { ...(base ?? {}) };
  for (const [k, v] of Object.entries(delta) as [keyof ShredSpec, number][]) {
    out[k] = (out[k] ?? 0) + v * mul;
  }
  return out;
}

function addBags(item: Item, bags: CorruptionBags | undefined, mul: number): Item {
  if (!bags) return item;
  const out: Item = { ...item };
  for (const bag of STAT_BAGS) {
    const delta = bags[bag];
    if (delta) out[bag] = addStats(addStats({}, item[bag]), delta, mul);
  }
  out.shred = addShred(item.shred, bags.shred, mul);
  return out;
}

/**
 * The item as this build entry holds it: base numbers, plus the corruption's
 * upgrade at the chosen roll, plus the chosen downside at its own roll.
 * Every reader downstream only ever sees the result, so corruption needs no
 * special cases anywhere else in the engine. The downside goes into `stats`
 * because it's a flat penalty on the hero, not gated by the item's own
 * trigger or stacks.
 */
export function applyCorruption(item: Item, entry: BuildItem): Item {
  if (!entry.corrupted || !isCorruptible(item)) return item;
  const c = item.corruption!;
  const upgradeMul = UPGRADE_ROLL_MULTIPLIER[entry.corruptionUpgradeRoll ?? "average"];
  const downsideMul = DOWNSIDE_ROLL_MULTIPLIER[entry.corruptionDownsideRoll ?? "average"];

  let out = addBags(item, c, upgradeMul);
  out = addBags(out, c.fixed, 1);
  const penalty = entry.corruptionDownsideId
    ? CORRUPTION_PENALTY_BY_ID[entry.corruptionDownsideId]
    : undefined;
  if (penalty && !c.excludedPenalties?.includes(penalty.id)) {
    out.stats = addStats(addStats({}, out.stats), downsideStats(item, penalty), downsideMul);
  }
  if (item.maxStacks) out.maxStacks = corruptedMaxStacks(item, entry);
  if (item.maxStacksSecondary) out.maxStacksSecondary = corruptedMaxStacksSecondary(item, entry);
  return out;
}

/** A row's corrupted value at a roll, rounded the way the game rounds it. */
export function corruptedRowValue(
  row: { base: number | null; bonus: number; variance: string },
  roll: CorruptionRoll,
): number {
  const mul = row.variance === "fixed" ? 1 : UPGRADE_ROLL_MULTIPLIER[roll];
  const value = (row.base ?? 0) + row.bonus * mul;
  return row.variance === "rounded" ? Math.round(value) : Math.round(value * 100) / 100;
}
