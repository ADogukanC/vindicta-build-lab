/**
 * The metric catalogue used by the comparison view.
 *
 * Keeping this as data rather than hard-coded table rows means the compare
 * table, the bar chart and the metric picker all stay in sync, and adding a new
 * comparable number is a one-line change.
 */
import type { CalcResult } from "./engine";
import { calculateBuild } from "./engine";
import type { Build, CalcContext, Item } from "../types";
import { addItemToBuild, removeItemFromBuild } from "../build";
import { planCost } from "./timeline";

export type MetricUnit = "flat" | "dps" | "souls" | "percent" | "seconds" | "mps";

export interface MetricDef {
  key: string;
  label: string;
  group: "Damage" | "Weapon" | "Survivability" | "Spirit" | "Economy";
  unit: MetricUnit;
  digits: number;
  higherIsBetter: boolean;
  get: (r: CalcResult) => number;
  /** Shown in the default comparison table. */
  primary?: boolean;
}

export const METRICS: MetricDef[] = [
  {
    key: "groundDps",
    label: "Ground DPS",
    group: "Damage",
    unit: "dps",
    digits: 0,
    higherIsBetter: true,
    primary: true,
    get: (r) => r.burstDps.ground.shredded,
  },
  {
    key: "flightDps",
    label: "Flight DPS",
    group: "Damage",
    unit: "dps",
    digits: 0,
    higherIsBetter: true,
    primary: true,
    get: (r) => r.burstDps.flight.shredded,
  },
  {
    key: "groundSustained",
    label: "Ground DPS with reloads",
    group: "Damage",
    unit: "dps",
    digits: 0,
    higherIsBetter: true,
    get: (r) => r.sustainedDps.ground.shredded,
  },
  {
    key: "flightSustained",
    label: "Flight DPS with reloads",
    group: "Damage",
    unit: "dps",
    digits: 0,
    higherIsBetter: true,
    get: (r) => r.sustainedDps.flight.shredded,
  },
  {
    key: "dpsAtRange",
    label: "DPS at chart marker",
    group: "Damage",
    unit: "dps",
    digits: 0,
    higherIsBetter: true,
    get: (r) => r.dpsAtRange,
  },
  {
    key: "procDps",
    label: "Expected proc DPS",
    group: "Damage",
    unit: "dps",
    digits: 0,
    higherIsBetter: true,
    get: (r) => r.expectedProcDps.reduce((s, p) => s + p.dps, 0),
  },
  {
    key: "clipGround",
    label: "Damage per magazine",
    group: "Damage",
    unit: "flat",
    digits: 0,
    higherIsBetter: true,
    get: (r) => r.perClip.ground.shredded,
  },
  {
    key: "bulletDamage",
    label: "Bullet damage",
    group: "Weapon",
    unit: "flat",
    digits: 1,
    higherIsBetter: true,
    primary: true,
    get: (r) => r.perBullet.ground.raw,
  },
  {
    key: "fireRate",
    label: "Fire rate",
    group: "Weapon",
    unit: "flat",
    digits: 2,
    higherIsBetter: true,
    primary: true,
    get: (r) => r.bulletsPerSecond,
  },
  {
    key: "ammo",
    label: "Magazine",
    group: "Weapon",
    unit: "flat",
    digits: 1,
    higherIsBetter: true,
    get: (r) => r.ammo,
  },
  {
    key: "reload",
    label: "Reload time",
    group: "Weapon",
    unit: "seconds",
    digits: 2,
    higherIsBetter: false,
    get: (r) => r.reloadTime,
  },
  {
    key: "velocity",
    label: "Bullet velocity",
    group: "Weapon",
    unit: "flat",
    digits: 0,
    higherIsBetter: true,
    get: (r) => r.bulletVelocity,
  },
  {
    key: "falloffMin",
    label: "Falloff start",
    group: "Weapon",
    unit: "flat",
    digits: 0,
    higherIsBetter: true,
    get: (r) => r.falloffMin,
  },
  {
    key: "health",
    label: "Health",
    group: "Survivability",
    unit: "flat",
    digits: 0,
    higherIsBetter: true,
    primary: true,
    get: (r) => r.health,
  },
  {
    key: "ehpBullet",
    label: "Effective HP vs bullets",
    group: "Survivability",
    unit: "flat",
    digits: 0,
    higherIsBetter: true,
    get: (r) => r.effectiveHpBullet,
  },
  {
    key: "ehpSpirit",
    label: "Effective HP vs spirit",
    group: "Survivability",
    unit: "flat",
    digits: 0,
    higherIsBetter: true,
    get: (r) => r.effectiveHpSpirit,
  },
  {
    key: "healthRegen",
    label: "Health regen",
    group: "Survivability",
    unit: "flat",
    digits: 1,
    higherIsBetter: true,
    get: (r) => r.healthRegen,
  },
  {
    key: "moveSpeed",
    label: "Move speed",
    group: "Survivability",
    unit: "mps",
    digits: 2,
    higherIsBetter: true,
    primary: true,
    get: (r) => r.moveSpeed,
  },
  {
    key: "sprintSpeed",
    label: "Sprint speed",
    group: "Survivability",
    unit: "mps",
    digits: 2,
    higherIsBetter: true,
    get: (r) => r.sprintSpeed,
  },
  {
    key: "spiritPower",
    label: "Spirit power",
    group: "Spirit",
    unit: "flat",
    digits: 0,
    higherIsBetter: true,
    primary: true,
    get: (r) => r.spiritPower,
  },
  {
    key: "bulletShred",
    label: "Bullet resist shred",
    group: "Spirit",
    unit: "percent",
    digits: 1,
    higherIsBetter: true,
    get: (r) => r.bulletResistShred,
  },
  {
    key: "spiritShred",
    label: "Spirit resist shred",
    group: "Spirit",
    unit: "percent",
    digits: 1,
    higherIsBetter: true,
    get: (r) => r.spiritResistShred,
  },
  {
    key: "abilityDps",
    label: "Ability DPS",
    group: "Spirit",
    unit: "dps",
    digits: 1,
    higherIsBetter: true,
    get: (r) => r.abilitySustainedDps,
  },
  {
    key: "abilityBurst",
    label: "Ability burst damage",
    group: "Spirit",
    unit: "flat",
    digits: 0,
    higherIsBetter: true,
    get: (r) => r.abilityBurstDamage,
  },
  {
    key: "itemSouls",
    label: "Souls spent",
    group: "Economy",
    unit: "souls",
    digits: 0,
    higherIsBetter: false,
    primary: true,
    get: (r) => r.itemSouls,
  },
  {
    key: "dpsPerSoul",
    label: "Ground DPS per 1k souls",
    group: "Economy",
    unit: "flat",
    digits: 1,
    higherIsBetter: true,
    primary: true,
    get: (r) => (r.burstDps.ground.shredded / (r.totalSouls || 1)) * 1000,
  },
  {
    key: "flightDpsPerSoul",
    label: "Flight DPS per 1k souls",
    group: "Economy",
    unit: "flat",
    digits: 1,
    higherIsBetter: true,
    get: (r) =>
      (r.burstDps.flight.shredded / (r.totalSouls || 1)) * 1000,
  },
  {
    key: "ehpPerSoul",
    label: "Effective HP per 1k souls",
    group: "Economy",
    unit: "flat",
    digits: 0,
    higherIsBetter: true,
    get: (r) => (r.effectiveHpBullet / (r.totalSouls || 1)) * 1000,
  },
];

export const METRIC_BY_KEY = Object.fromEntries(METRICS.map((m) => [m.key, m]));

export function formatMetric(metric: MetricDef, value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (metric.unit === "percent") return `${(value * 100).toFixed(metric.digits)}%`;
  const s = value.toLocaleString(undefined, {
    minimumFractionDigits: metric.digits,
    maximumFractionDigits: metric.digits,
  });
  if (metric.unit === "seconds") return `${s}s`;
  if (metric.unit === "mps") return `${s} m/s`;
  return s;
}

export interface ItemContribution {
  item: Item;
  /** Metric value with the item, minus the value without it. */
  delta: number;
  /** `delta` scaled to a per-1000-souls figure. */
  deltaPer1kSouls: number;
  cost: number;
}

/**
 * Marginal value of each item in a build: how much a metric drops if that one
 * item is removed and everything else is left alone. This is what actually
 * answers "is this item worth its souls in *this* build", because it accounts
 * for the multiplicative interactions the shop tooltip cannot.
 *
 * Removing an item can also drop the build below a category investment
 * threshold, and that loss is correctly attributed to the item here.
 */
export function itemContributions(
  build: Build,
  ctx: CalcContext,
  metricKey: string,
): ItemContribution[] {
  const metric = METRIC_BY_KEY[metricKey] ?? METRICS[0];
  const baseline = metric.get(calculateBuild(build, ctx));
  const bySlug = new Map(ctx.items.map((i) => [i.slug, i]));

  const rows: ItemContribution[] = [];
  for (const entry of build.items) {
    const item = bySlug.get(entry.slug);
    if (!item) continue;
    const without = metric.get(calculateBuild(removeItemFromBuild(build, entry.slug), ctx));
    const delta = baseline - without;
    rows.push({
      item,
      delta,
      deltaPer1kSouls: item.cost > 0 ? (delta / item.cost) * 1000 : 0,
      cost: item.cost,
    });
  }
  return rows.sort((a, b) => b.deltaPer1kSouls - a.deltaPer1kSouls);
}

/**
 * What each *unowned* item would add if bought next, sorted by value per soul.
 * The counterpart to `itemContributions`, and the basis of the "what to buy
 * next" suggestion list.
 */
export function purchaseCandidates(
  build: Build,
  ctx: CalcContext,
  metricKey: string,
  limit = 12,
): ItemContribution[] {
  const metric = METRIC_BY_KEY[metricKey] ?? METRICS[0];
  const baselineResult = calculateBuild(build, ctx);
  const baseline = metric.get(baselineResult);
  const baselineSpent = baselineResult.timeline.soulsSpent;
  const owned = new Set(build.items.map((i) => i.slug));

  const rows: ItemContribution[] = [];
  for (const item of ctx.items) {
    if (owned.has(item.slug)) continue;
    // Appending the purchase to the plan and re-running the timeline prices it
    // the way the game does: components already held are absorbed, so the true
    // cost is the difference, not the sticker price.
    const withItem = addItemToBuild(build, item);
    // Give the plan enough souls to actually reach the new purchase.
    const candidate: Build = {
      ...withItem,
      soulsEarned: Math.max(build.soulsEarned, planCost(withItem, ctx.items)),
    };
    const after = calculateBuild(candidate, ctx);
    const netCost = Math.max(0, after.timeline.soulsSpent - baselineSpent);
    const delta = metric.get(after) - baseline;
    if (Math.abs(delta) < 1e-9) continue;
    rows.push({
      item,
      delta,
      deltaPer1kSouls: netCost > 0 ? (delta / netCost) * 1000 : 0,
      cost: netCost,
    });
  }
  return rows.sort((a, b) => b.deltaPer1kSouls - a.deltaPer1kSouls).slice(0, limit);
}
