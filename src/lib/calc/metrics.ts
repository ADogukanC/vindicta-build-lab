/**
 * The metric catalogue used by the comparison view.
 *
 * Keeping this as data rather than hard-coded table rows means the compare
 * table, the bar chart and the metric picker all stay in sync, and adding a new
 * comparable number is a one-line change.
 */
import type { CalcResult } from "./engine";
import { calculateBuild } from "./engine";
import type { Build, BuildItem, CalcContext, Item } from "../types";
import { addItemToBuild } from "../build";
import { planCost } from "./timeline";

/**
 * Passed as `maxSlots` when evaluating a purchase candidate, so a loadout
 * already at 12 items doesn't force the timeline to auto-sell an unrelated
 * held item just to make room - see the comment in `purchaseCandidates`.
 */
const UNLIMITED_SLOTS = Number.POSITIVE_INFINITY;

/**
 * How to size a stacking item's stack count when judging its value. Real
 * stack uptime varies build to build and moment to moment (kill stacks,
 * debuff stacks that fall off, …), so the value-per-soul section lets the
 * user pick the assumption rather than silently defaulting to one.
 */
export type StackAssumption = "none" | "half" | "full";

function stacksForAssumption(maxStacks: number | undefined, assumption: StackAssumption): number {
  if (!maxStacks) return 0;
  if (assumption === "none") return 0;
  if (assumption === "half") return Math.round(maxStacks / 2);
  return maxStacks;
}

/**
 * Forces every conditional item's situational bonus on, and every stacking
 * item's stack count to the chosen assumption. Value-per-soul is a decision
 * tool answering "is this worth buying" - judging it by whatever a saved
 * build's toggles or stack sliders happen to be sitting at (often just left
 * at the item's own default, which is *off* for cooldown-gated procs per the
 * item-authoring rule in calc/CLAUDE.md) systematically undercounts items
 * whose value lives behind a toggle, which is exactly backwards for a "what
 * should I buy" ranking.
 */
function withAssumptions(
  entries: BuildItem[],
  itemsBySlug: Map<string, Item>,
  stackAssumption: StackAssumption,
): BuildItem[] {
  return entries.map((entry) => {
    const item = itemsBySlug.get(entry.slug);
    if (!item) return entry;
    return {
      ...entry,
      active: item.conditional ? true : entry.active,
      stacks: item.maxStacks ? stacksForAssumption(item.maxStacks, stackAssumption) : entry.stacks,
      stacksSecondary: item.maxStacksSecondary
        ? stacksForAssumption(item.maxStacksSecondary, stackAssumption)
        : entry.stacksSecondary,
    };
  });
}

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
 *
 * Only currently-*held* items are scored (not the full purchase plan). A plan
 * can list purchases the souls figure hasn't reached yet, and dropping a held
 * item out of the ordered plan lowers every later threshold — which, against
 * the full plan, can pull a still-pending purchase into "held" as a side
 * effect and contaminate that item's number with someone else's value. Testing
 * against the held-only loadout (with the plan truncated to just that list)
 * keeps each item's number isolated to itself.
 */
export function itemContributions(
  build: Build,
  ctx: CalcContext,
  metricKey: string,
  stackAssumption: StackAssumption = "full",
): ItemContribution[] {
  const metric = METRIC_BY_KEY[metricKey] ?? METRICS[0];
  const bySlug = new Map(ctx.items.map((i) => [i.slug, i]));
  const assumedBuild: Build = { ...build, items: withAssumptions(build.items, bySlug, stackAssumption) };
  const baselineResult = calculateBuild(assumedBuild, ctx);
  const baseline = metric.get(baselineResult);
  const held = baselineResult.timeline.held;

  const rows: ItemContribution[] = [];
  for (const entry of held) {
    const item = bySlug.get(entry.slug);
    if (!item) continue;
    const withoutBuild: Build = { ...assumedBuild, items: held.filter((h) => h.slug !== entry.slug) };
    const without = metric.get(calculateBuild(withoutBuild, ctx));
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
 * What each *unowned* item would add if bought next, sorted by raw value per
 * soul (`deltaPer1kSouls`) — no net-worth-stage weighting on top of it, so a
 * cheap item's true ratio is judged exactly as computed, never re-scaled
 * because the build happens to be at a high or low souls figure. The
 * counterpart to `itemContributions`, and the basis of the "what to buy
 * next" suggestion list.
 *
 * Each candidate is inserted right after the items currently held — not
 * appended after the rest of the plan's still-pending purchases — and only
 * given just enough souls to reach that one purchase. Appending to the end
 * would force the souls figure up to whatever the *entire* plan costs,
 * which both prices the candidate using other people's purchases and, since
 * boons key off souls earned, invents boons the player doesn't actually have
 * yet at this point in the match. Boons are pinned to the baseline's own
 * figure for the same reason: buying one more item does not change how many
 * souls you've earned.
 */
export function purchaseCandidates(
  build: Build,
  ctx: CalcContext,
  metricKey: string,
  limit = 12,
  stackAssumption: StackAssumption = "full",
): ItemContribution[] {
  const metric = METRIC_BY_KEY[metricKey] ?? METRICS[0];
  const bySlug = new Map(ctx.items.map((i) => [i.slug, i]));
  const assumedBuild: Build = { ...build, items: withAssumptions(build.items, bySlug, stackAssumption) };
  const baselineResult = calculateBuild(assumedBuild, ctx);
  const baseline = metric.get(baselineResult);
  const held = baselineResult.timeline.held;
  // The real plan's own soulsSpent is gross spend over its whole purchase
  // history, including anything bought and later sold to free a slot - once
  // a build has sold even one item, that figure runs well above what the
  // loadout it's currently holding actually costs. A candidate's netCost
  // below is computed the same isolated way (just the held items, replayed
  // fresh), so the baseline it's compared against has to be priced the same
  // way, or every candidate's netCost silently floors to 0 and its ranking
  // number vanishes.
  const baselineSpent = calculateBuild({ ...assumedBuild, items: held }, ctx).timeline.soulsSpent;
  // Anything already in the plan - held or still pending - is not a "next
  // purchase" suggestion; it's already spoken for.
  const owned = new Set(build.items.map((i) => i.slug));

  const rows: ItemContribution[] = [];
  for (const item of ctx.items) {
    if (owned.has(item.slug)) continue;
    // Appending the purchase right after the held loadout and re-running the
    // timeline prices it the way the game does: components already held are
    // absorbed, so the true cost is the difference, not the sticker price.
    // The candidate itself is a fresh BuildItem seeded from the item's own
    // defaults, so it needs the same assumption pass as everything else -
    // otherwise a cooldown-gated proc item would price its own conditional
    // bonus at off even though every held item was just forced on.
    const withItem = addItemToBuild({ ...assumedBuild, items: held }, item);
    const withItemAssumed: Build = { ...withItem, items: withAssumptions(withItem.items, bySlug, stackAssumption) };
    const candidate: Build = {
      ...withItemAssumed,
      // Give the plan enough souls to actually reach this one purchase, but
      // never fewer than what the player already has.
      soulsEarned: Math.max(build.soulsEarned, planCost(withItemAssumed, ctx.items, UNLIMITED_SLOTS)),
      boonsFromSouls: false,
      boons: baselineResult.boons,
    };
    // A held loadout already at 12 items would otherwise force the timeline
    // to auto-sell whatever was bought earliest just to make room, drowning
    // the candidate's own value in the unrelated item it "sold". This is a
    // "what does this item add" question, not a "what would I sell for it"
    // one, so the slot cap is lifted for this one hypothetical evaluation.
    const after = calculateBuild(candidate, ctx, { maxSlots: UNLIMITED_SLOTS });
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
