/**
 * Vindicta damage engine.
 *
 * Started life as a port of "Zag's Gundicta DPS Calculator" and is still
 * verified against it cell-by-cell (see `engine.test.ts`). Item data now comes
 * from the game's own tables via deadlock.wiki, so stats, resist shred,
 * stacking and conditional flags are data-driven rather than hand-entered.
 *
 * One workbook quirk is preserved deliberately: gun damage's spirit scaling
 * reads *pre-item* spirit power, so spirit items do not raise bullet damage.
 * `build.gunDamageUsesTotalSpirit` switches to total spirit.
 */

import type {
  Ability,
  AbilityEffects,
  Build,
  BuildItem,
  CalcContext,
  Item,
  ItemCategory,
  Progression,
} from "../types";
import { addStats, statValue, type StatBag } from "../stats";
import { simulateTimeline, type TimelineResult } from "./timeline";

/** Excel's `XLOOKUP(x, keys, values, 0, -1)`: the last row whose key is <= x. */
export function lookupStepDown<T extends { souls: number }>(rows: T[], souls: number): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (row.souls <= souls && (best === null || row.souls > best.souls)) best = row;
  }
  return best;
}

/** Multiplicative resist stacking: `1 - Π(1 - shred_i)`. */
export function combineShred(values: number[]): number {
  let remaining = 1;
  for (const v of values) {
    if (!v) continue;
    remaining *= 1 - v;
  }
  return 1 - remaining;
}

export interface ResolvedItem {
  item: Item;
  entry: BuildItem;
  /** Whether the item's situational bonuses are being counted. */
  contributing: boolean;
  stacks: number;
  /** Stack count for the item's second, independent stack track, if any. */
  stacksSecondary: number;
}

export interface ShredBreakdownRow {
  label: string;
  bullet: number;
  spirit: number;
  active: boolean;
}

/** One contribution to spirit power, so the total can be checked line by line. */
export interface SpiritSource {
  label: string;
  value: number;
  /** Only counted because the item's situational toggle is on. */
  conditional?: boolean;
  /** A multiplier applied to the running total rather than added to it. */
  multiplier?: boolean;
}

export interface ResolvedAbility {
  ability: Ability;
  effects: AbilityEffects;
  damage: number;
  bonusDamage: number;
  cooldown: number;
  charges: number;
  upgradesTaken: boolean[];
  abilityPointsSpent: number;
}

export interface DamageSet {
  /** Damage before any resist shred is applied to the target. */
  raw: number;
  /** Damage once the build's resist shred is applied. */
  shredded: number;
}

/**
 * The full damage spread for an ability that has a conditional bonus and a
 * charge/headshot mechanic — Assassinate, in practice.
 */
export interface AbilityDamageProfile {
  key: string;
  name: string;
  /** Fully charged body shot. */
  base: DamageSet;
  /** The conditional extra on top of the base. */
  bonus: DamageSet;
  bonusLabel: string;
  /** base + bonus: the number that matters when finishing someone off. */
  max: DamageSet;
  headshot: DamageSet;
  maxHeadshot: DamageSet;
  uncharged: DamageSet;
  unchargedMax: DamageSet;
  headshotBonusPct: number;
  noChargeDamagePct: number;
  chargeTime: number;
}

export interface AbilityResult {
  key: string;
  name: string;
  slot: number;
  hitDamage: DamageSet;
  dotTotal: DamageSet;
  totalDamage: DamageSet;
  /** Bleed expressed as a percentage of the target's current health per second. */
  dotTargetHealthPctPerSecond: number;
  effectiveCooldown: number;
  charges: number;
  dps: DamageSet;
  /** Spirit power this ability sees, including any imbue assigned to it. */
  spiritPower: number;
  /** Names of the imbue items assigned to this ability. */
  imbuedBy: string[];
  needsVerification: boolean;
}

export interface CalcResult {
  boons: number;
  abilityPoints: number;
  abilityPointsSpent: number;
  itemSouls: number;
  soulsByCategory: Record<ItemCategory, number>;
  boonSouls: number;
  totalSouls: number;
  itemCount: number;
  /** Where this build is along its purchase plan. */
  timeline: TimelineResult;

  weaponInvestmentPct: number;
  vitalityInvestmentPct: number;
  spiritInvestmentFlat: number;

  baseSpiritPower: number;
  spiritPower: number;
  spiritBreakdown: SpiritSource[];
  baseGunDamage: number;
  bulletDamage: number;
  /** Spirit damage carried by every bullet, e.g. Mercurial Magnum. */
  bulletSpiritDamage: number;
  /** The items granting it, so the readout can name them. */
  bulletSpiritDamageSources: string[];
  health: number;
  healthRegen: number;
  outOfCombatHealthRegen: number;
  combatBarrier: number;
  bulletResistPct: number;
  spiritResistPct: number;
  debuffResistPct: number;
  effectiveHpBullet: number;
  effectiveHpSpirit: number;
  lightMelee: number;
  heavyMelee: number;
  bulletsPerSecond: number;
  ammo: number;
  flightAmmo: number;
  reloadTime: number;
  bulletVelocity: number;
  moveSpeed: number;
  sprintSpeed: number;
  stamina: number;
  falloffMin: number;
  falloffMax: number;
  falloffValue: number;

  snipeStackBonus: number;
  /** Share of bullets landing as headshots, 0-1. */
  headshotRate: number;
  /** Extra weapon damage a headshot adds, 0-1, including item bonuses. */
  headshotBonus: number;
  /** What an average bullet's weapon half is multiplied by at this rate. */
  headshotMultiplier: number;
  spiritAmp: number;
  damageMultiplier: number;
  bulletResistShred: number;
  spiritResistShred: number;
  shredBreakdown: ShredBreakdownRow[];
  cooldownReductionPct: number;

  flightBonusDamage: number;
  /** Spirit power Flight sees, including any imbue assigned to it. */
  flightSpiritPower: number;
  flightImbuedBy: string[];

  perBullet: { ground: DamageSet; flight: DamageSet };
  /**
   * The two halves of a bullet kept apart. They meet different resists, so the
   * split is what makes a total explainable rather than just asserted.
   */
  perBulletParts: {
    ground: { weapon: DamageSet; spirit: DamageSet; proc: DamageSet };
    flight: { weapon: DamageSet; spirit: DamageSet; proc: DamageSet };
  };
  /**
   * Damage passed to nearby enemies. Reported on its own because it lands on
   * *other* targets, so folding it into the headline would overstate what any
   * one enemy takes.
   */
  ricochet: {
    damagePct: number;
    targets: number;
    /** Per secondary target. */
    perBullet: { ground: DamageSet; flight: DamageSet };
    dps: { ground: DamageSet; flight: DamageSet };
    /** Across every secondary target at once. */
    totalDps: { ground: DamageSet; flight: DamageSet };
  } | null;
  perClip: { ground: DamageSet; flight: DamageSet };
  /** Damage per second while the trigger is held, ignoring reloads. */
  burstDps: { ground: DamageSet; flight: DamageSet };
  /** Damage per second including the time spent reloading between magazines. */
  sustainedDps: { ground: DamageSet; flight: DamageSet };
  timeToEmpty: number;
  timeToEmptyFlight: number;

  /** Expected extra DPS from chance-based items, reported separately. */
  expectedProcDps: { label: string; dps: number }[];

  abilities: AbilityResult[];
  resolvedAbilities: ResolvedAbility[];
  damageProfiles: AbilityDamageProfile[];
  abilityBurstDamage: number;
  abilitySustainedDps: number;

  groundDps: number;
  flightDps: number;
  dpsAtRange: number;
  /** Same marker, ignoring this build's own resist shred — pairs with `dpsAtRange` for the shred toggle. */
  dpsAtRangeRaw: number;

  itemStats: StatBag;
  resolvedItems: ResolvedItem[];
  warnings: string[];
}

/** Damage falloff multiplier at `distance` metres. */
export function falloffMultiplier(
  distance: number,
  min: number,
  max: number,
  falloffValue: number,
): number {
  if (distance <= min) return 1;
  if (distance >= max) return 1 - falloffValue;
  return 1 - (falloffValue * (distance - min)) / (max - min);
}

export function resolveItems(build: Build, items: Item[], held?: BuildItem[]): ResolvedItem[] {
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  const out: ResolvedItem[] = [];
  for (const entry of held ?? build.items) {
    const item = bySlug.get(entry.slug);
    if (!item) continue;
    const contributing = item.conditional ? entry.active : true;
    const maxStacks = item.maxStacks ?? 0;
    const stacks = maxStacks > 0 ? Math.max(0, Math.min(maxStacks, entry.stacks)) : 0;
    const maxStacksSecondary = item.maxStacksSecondary ?? 0;
    const stacksSecondary =
      maxStacksSecondary > 0 ? Math.max(0, Math.min(maxStacksSecondary, entry.stacksSecondary)) : 0;
    out.push({ item, entry, contributing, stacks, stacksSecondary });
  }
  return out;
}

/** Folds an ability's taken upgrades into its base numbers. */
export function resolveAbility(ability: Ability, taken: boolean[] = []): ResolvedAbility {
  let effects: AbilityEffects = { ...(ability.effects ?? {}) };
  let damage = ability.baseDamage;
  let bonusDamage = ability.bonusDamage ?? 0;
  let cooldown = ability.cooldown;
  let charges = ability.charges ?? 1;
  let abilityPointsSpent = 0;

  (ability.upgrades ?? []).forEach((upgrade, index) => {
    if (!taken[index]) return;
    abilityPointsSpent += upgrade.cost;
    effects = { ...effects, ...(upgrade.effects ?? {}) };
    damage += upgrade.damageDelta ?? 0;
    bonusDamage += upgrade.bonusDamageDelta ?? 0;
    cooldown += upgrade.cooldownDelta ?? 0;
    charges += upgrade.chargesDelta ?? 0;
  });

  return {
    ability,
    effects,
    damage,
    bonusDamage,
    cooldown: Math.max(0, cooldown),
    charges: Math.max(1, charges),
    upgradesTaken: (ability.upgrades ?? []).map((_, i) => Boolean(taken[i])),
    abilityPointsSpent,
  };
}

/**
 * Boon (the app's own 0-indexed count) at which a hero's Nth ability slot
 * unlocks — universal across every hero, not just Vindicta: slot 1 is
 * available from the start, one non-ultimate slot unlocks every couple of
 * boons after, and the ultimate (slot 4) unlocks last. Per deadlock.wiki/Boon:
 * "Levels 0, 2, 4 and 7 grant an ability unlock... The first three ability
 * unlocks can only be used on non-ultimate abilities. The ultimate can be
 * unlocked at 3.8k [souls]" — which is boon 7 in the local progression table,
 * matching its own "Snipe Unlock" note on Assassinate (slot 4).
 */
export const ABILITY_UNLOCK_BOONS = [0, 2, 4, 7];

/**
 * Turns an AP order (a flat list of ability keys — the Nth occurrence of a
 * key is that ability's tier N) into the same `{ abilityKey: [t1,t2,t3] }`
 * shape as manual `abilityUpgrades`, spending strictly in the given order and
 * stopping the moment the next upgrade would exceed `abilityPointsBudget` —
 * or would land on an ability slot that hasn't unlocked yet at `boons`.
 * Mirrors how the item timeline cuts the buy order by souls earned: order is
 * a promise, not a set, so a later, already-unlocked, affordable upgrade
 * never jumps ahead of an earlier one the plan hasn't reached yet.
 */
export function deriveAbilityUpgradesFromApOrder(
  apOrder: string[],
  abilities: Ability[],
  abilityPointsBudget: number,
  boons: number,
): Record<string, boolean[]> {
  const abilityByKey = new Map(abilities.map((a) => [a.key, a]));
  const occurrence: Record<string, number> = {};
  const taken: Record<string, boolean[]> = {};
  for (const a of abilities) taken[a.key] = [false, false, false];

  let spent = 0;
  for (const key of apOrder) {
    const ability = abilityByKey.get(key);
    if (!ability) continue;
    const unlockBoons = ABILITY_UNLOCK_BOONS[ability.slot - 1] ?? 0;
    if (boons < unlockBoons) break;
    const tierIndex = occurrence[key] ?? 0;
    occurrence[key] = tierIndex + 1;
    const upgrade = ability.upgrades?.[tierIndex];
    if (!upgrade) continue; // already at max tier (or a duplicate beyond it)
    if (spent + upgrade.cost > abilityPointsBudget) break;
    taken[key][tierIndex] = true;
    spent += upgrade.cost;
  }
  return taken;
}

export function calculateBuild(build: Build, ctx: CalcContext): CalcResult {
  const { hero, items, progression } = ctx;
  const warnings: string[] = [];

  // Which purchases have happened by this point in the match.
  const timeline = simulateTimeline(build, items, build.soulsEarned);
  warnings.push(...timeline.warnings);
  const resolved = resolveItems(build, items, timeline.held);

  // ---------------------------------------------------------------- souls ---
  const soulsByCategory: Record<ItemCategory, number> = { Weapon: 0, Vitality: 0, Spirit: 0 };
  for (const r of resolved) soulsByCategory[r.item.category] += r.item.cost;
  const itemSouls = soulsByCategory.Weapon + soulsByCategory.Vitality + soulsByCategory.Spirit;

  // Boons come from souls *earned*. Selling refunds spending power but is not
  // income, so it never moves your level.
  const boonFromSouls = lookupStepDown(progression.boons, build.soulsEarned);
  const boons = build.boonsFromSouls
    ? (boonFromSouls?.boons ?? 0)
    : Math.max(0, Math.min(hero.maxBoons, build.boons));
  const boonRow =
    progression.boons.find((b) => b.boons === boons) ?? lookupStepDown(progression.boons, 0);
  const boonSouls = boonRow?.souls ?? 0;
  const abilityPoints = boonRow?.abilityPoints ?? 0;

  const weaponInvestmentPct =
    lookupStepDown(progression.investment, soulsByCategory.Weapon)?.weaponPct ?? 0;
  const vitalityInvestmentPct =
    lookupStepDown(progression.investment, soulsByCategory.Vitality)?.vitalityPct ?? 0;
  const spiritInvestmentFlat =
    lookupStepDown(progression.investment, soulsByCategory.Spirit)?.spiritFlat ?? 0;

  // ------------------------------------------------------------ abilities ---
  // An AP order, if the build has one, drives which tiers are taken instead
  // of the manual abilityUpgrades toggles — same relationship as items and
  // the buy order, one souls-driven plan superseding hand-set state.
  const effectiveAbilityUpgrades = build.apOrder?.length
    ? deriveAbilityUpgradesFromApOrder(build.apOrder, hero.abilities, abilityPoints, boons)
    : build.abilityUpgrades;
  const resolvedAbilities = hero.abilities
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map((a) => resolveAbility(a, effectiveAbilityUpgrades?.[a.key] ?? []));
  const abilityByKey = new Map(resolvedAbilities.map((r) => [r.ability.key, r]));
  const abilityPointsSpent = resolvedAbilities.reduce((s, r) => s + r.abilityPointsSpent, 0);

  const crow = abilityByKey.get("crow-familiar")?.effects;
  const flight = abilityByKey.get("flight")?.effects;
  const assassinate = abilityByKey.get("assassinate")?.effects;

  /**
   * An imbue item's stats land on exactly one ability, so each ability gets its
   * own spirit power, cooldown reduction and bonus damage. Defined up here
   * because Flight's bonus bullet damage needs it too, not just the ability
   * damage rollup further down.
   */
  function imbueFor(abilityKey: string) {
    const bag: StatBag = {};
    const names: string[] = [];
    for (const r of resolved) {
      if (!r.item.imbuedStats) continue;
      if (build.imbueTargets?.[r.item.slug] !== abilityKey) continue;
      addStats(bag, r.item.imbuedStats);
      names.push(r.item.name);
    }
    return { bag, names };
  }

  // ------------------------------------------------------------ item stats ---
  const itemStats: StatBag = {};
  for (const r of resolved) {
    addStats(itemStats, r.item.stats);
    if (r.contributing) {
      addStats(itemStats, r.item.conditionalStats);
      if (r.item.perStack) addStats(itemStats, r.item.perStack, r.stacks);
      if (r.item.perStackSecondary) addStats(itemStats, r.item.perStackSecondary, r.stacksSecondary);
      if (r.item.perBoon) addStats(itemStats, r.item.perBoon, boons);
    }
  }

  // -------------------------------------------------------- hero base stats ---
  const baseSpiritPower = hero.base.spiritPower + hero.perBoon.spiritPower * boons;

  // Built alongside the total so a disagreement with the game can be traced to
  // a single line rather than re-derived by hand.
  const spiritBreakdown: SpiritSource[] = [
    { label: `${boons} boons`, value: baseSpiritPower },
  ];
  if (spiritInvestmentFlat) {
    spiritBreakdown.push({
      label: `Spirit investment (${soulsByCategory.Spirit.toLocaleString()} souls)`,
      value: spiritInvestmentFlat,
    });
  }
  for (const r of resolved) {
    const flat = statValue(r.item.stats, "spiritPowerFlat");
    if (flat) spiritBreakdown.push({ label: r.item.name, value: flat });
    const conditional = statValue(r.item.conditionalStats, "spiritPowerFlat");
    if (conditional && r.contributing) {
      spiritBreakdown.push({
        label: `${r.item.name} — ${r.item.conditional?.label ?? "conditional"}`,
        value: conditional,
        conditional: true,
      });
    }
  }
  if (build.adjustables.spiritPowerFlat) {
    spiritBreakdown.push({ label: "Statue buff", value: build.adjustables.spiritPowerFlat });
  }

  const spiritPowerPct = statValue(itemStats, "spiritPowerPct");
  const spiritPower =
    (baseSpiritPower +
      spiritInvestmentFlat +
      statValue(itemStats, "spiritPowerFlat") +
      build.adjustables.spiritPowerFlat) *
    (1 + spiritPowerPct / 100);
  if (spiritPowerPct) {
    spiritBreakdown.push({
      label: `+${spiritPowerPct}% spirit power`,
      value: spiritPowerPct,
      multiplier: true,
    });
  }

  for (const r of resolved) {
    if (!r.contributing || !r.item.perSpirit) continue;
    addStats(itemStats, r.item.perSpirit, spiritPower);
  }

  const spiritForGunDamage = build.gunDamageUsesTotalSpirit ? spiritPower : baseSpiritPower;
  const baseGunDamage =
    hero.base.gunDamage +
    boons * hero.perBoon.gunDamage +
    spiritForGunDamage * hero.gunDamageSpiritScaling;

  const snipeStackBonus = build.snipeStacks * (assassinate?.gunDamagePerStack ?? 0);

  // ----------------------------------------------------- damage multipliers ---
  // Penalties add rather than compound, which is how the workbook reached 0.76
  // for Cursed Relic plus Golden Goose Egg rather than 0.774.
  let damagePenalty = 0;
  for (const r of resolved) {
    if (r.item.damageMultiplier != null) damagePenalty += 1 - r.item.damageMultiplier;
  }
  const damageMultiplier = 1 - damagePenalty;

  // Spirit amp comes from items such as Escalating Exposure (4.5% per stack).
  const spiritAmp = statValue(itemStats, "spiritAmpPct") / 100;

  // ------------------------------------------------------------ resist shred ---
  const shredBreakdown: ShredBreakdownRow[] = [];
  const bulletShredParts: number[] = [];
  const spiritShredParts: number[] = [];

  if (crow && (crow.bulletResistShred || crow.spiritResistShred)) {
    const bullet = crow.bulletResistShred ?? 0;
    const spirit = crow.spiritResistShred ?? 0;
    shredBreakdown.push({
      label: "Crow Familiar",
      bullet,
      spirit,
      active: build.crowShredActive,
    });
    if (build.crowShredActive) {
      bulletShredParts.push(bullet);
      spiritShredParts.push(spirit);
    }
  }

  for (const r of resolved) {
    const shred = r.item.shred;
    if (!shred) continue;
    const active = r.contributing && r.entry.shredActive;
    const bullet = (shred.bullet ?? 0) + (shred.bulletPerSpirit ?? 0) * spiritPower;
    const spirit = (shred.spirit ?? 0) + (shred.spiritPerSpirit ?? 0) * spiritPower;
    if (bullet || spirit) {
      shredBreakdown.push({ label: r.item.name, bullet, spirit, active });
    }
    if (active) {
      bulletShredParts.push(bullet);
      spiritShredParts.push(spirit);
      for (let i = 0; i < r.stacks; i++) {
        if (shred.perStackBullet) bulletShredParts.push(shred.perStackBullet);
        if (shred.perStackSpirit) spiritShredParts.push(shred.perStackSpirit);
      }
      if (r.stacks > 0 && (shred.perStackBullet || shred.perStackSpirit)) {
        shredBreakdown.push({
          label: `${r.item.name} — ${r.stacks} stack${r.stacks === 1 ? "" : "s"}`,
          bullet: (shred.perStackBullet ?? 0) * r.stacks,
          spirit: (shred.perStackSpirit ?? 0) * r.stacks,
          active,
        });
      }
    }
  }

  const bulletResistShred = combineShred(bulletShredParts);
  const spiritResistShred = combineShred(spiritShredParts);

  // Deadlock resist: damage taken = raw x (1 - resist), and shred subtracts
  // straight off the target's resist rather than being its own multiplier
  // (deadlock.wiki/Damage_Resistance). Bullet and spirit are tracked
  // separately, same as shred — a target can resist one and not the other.
  // Enemy Resist defaults to 0, which is the strawman the app always
  // assumed — shred alone then reads as pure negative resist, exactly
  // reproducing the pre-Enemy-Resist numbers. Floored at 0 so an
  // over-resisted target can't show negative damage.
  const clampResist = (pct: number | undefined) => Math.max(0, Math.min(100, pct ?? 0)) / 100;
  const enemyBulletResist = clampResist(build.enemyBulletResistPct);
  const enemySpiritResist = clampResist(build.enemySpiritResistPct);
  const bulletResistMul = Math.max(0, 1 - enemyBulletResist + bulletResistShred);
  const spiritResistMul = Math.max(0, 1 - enemySpiritResist + spiritResistShred);
  const bulletNoShredMul = Math.max(0, 1 - enemyBulletResist);
  const spiritNoShredMul = Math.max(0, 1 - enemySpiritResist);

  // -------------------------------------------------------------- weapon ---
  const bulletDamage =
    (baseGunDamage + statValue(itemStats, "weaponDamageFlat")) *
    (1 +
      snipeStackBonus +
      weaponInvestmentPct +
      statValue(itemStats, "weaponDamagePct") / 100 +
      build.adjustables.bulletDamagePct / 100);

  // --------------------------------------------------------------- headshots ---
  // A headshot adds a share of weapon damage. Crucially it *adds* rather than
  // multiplies: a Lucky Shot proc on a headshot is 165% + 100% = 265% of a
  // bullet, not 165% x 200%. So the two bonuses sit side by side on the same
  // base, and the proc's contribution is untouched by how often you hit heads.
  // Spirit damage carried by a bullet gets nothing from a headshot at all.
  const headshotBonus =
    (hero.headshotBonusPct + statValue(itemStats, "headshotDamagePct")) / 100;
  const headshotRate = Math.max(0, Math.min(100, build.headshotRate ?? 0)) / 100;
  const headshotMultiplier = 1 + headshotRate * headshotBonus;
  /** Weapon damage of an average bullet at this headshot rate. */
  const weaponPerBullet = bulletDamage * headshotMultiplier;

  // Spirit damage riding along on every bullet. Mercurial Magnum's share is a
  // percentage of *base* gun damage — 25% plus 0.49% per point of spirit — which
  // is the workbook's E35: `((0.25 + spirit*0.0049) * B20) * (1 + spiritAmp)`.
  const bulletSpiritDamage =
    ((baseGunDamage * statValue(itemStats, "bulletSpiritDamagePctOfBase")) / 100 +
      statValue(itemStats, "bulletSpiritDamageFlat")) *
    (1 + spiritAmp);
  const bulletSpiritDamageSources = resolved
    .filter(
      (r) =>
        statValue(r.item.stats, "bulletSpiritDamagePctOfBase") ||
        statValue(r.item.stats, "bulletSpiritDamageFlat") ||
        statValue(r.item.perSpirit, "bulletSpiritDamagePctOfBase"),
    )
    .map((r) => r.item.name);

  const bulletsPerSecond =
    hero.base.bulletsPerSecond *
    (1 + statValue(itemStats, "fireRatePct") / 100 + build.adjustables.fireRatePct / 100);
  const ammo =
    hero.base.ammo * (1 + statValue(itemStats, "ammoPct") / 100 + build.adjustables.ammoPct / 100) +
    statValue(itemStats, "ammoFlat");
  // Flight grants a percentage of the *base* magazine, not the modified one.
  const flightAmmoMultiplier = flight?.flightAmmoMultiplier ?? 1;
  const flightAmmo = ammo + hero.base.ammo * (flightAmmoMultiplier - 1);
  const reloadTime = hero.base.reloadTime * (1 - statValue(itemStats, "reloadSpeedPct") / 100);
  const bulletVelocity =
    hero.base.bulletVelocity * (1 + statValue(itemStats, "bulletVelocityPct") / 100);

  const falloffScale = 1 + statValue(itemStats, "falloffRangePct") / 100;
  const falloffMin = hero.base.falloffMin * falloffScale;
  const falloffMax = hero.base.falloffMax * falloffScale;

  // Flight's bonus spirit damage per bullet. It scales off spirit power, so an
  // imbue assigned to Flight has to feed this and not just ability damage.
  const flightImbue = imbueFor("flight");
  const flightSpiritPower = spiritPower + statValue(flightImbue.bag, "spiritPowerFlat");
  const flightBase = flight?.flightBaseDamage ?? 0;
  const flightScaling = flight?.flightSpiritScaling ?? 0;
  const flightBonusDamage =
    (flightBase + flightScaling * flightSpiritPower) *
    (1 + spiritAmp) *
    (1 + statValue(flightImbue.bag, "abilityDamagePct") / 100);

  // ------------------------------------------------------------ vitality ---
  const health =
    (hero.base.health + hero.perBoon.health * boons + statValue(itemStats, "bonusHealthFlat")) *
    (1 + vitalityInvestmentPct + statValue(itemStats, "bonusHealthPct") / 100);
  const combatBarrier = statValue(itemStats, "combatBarrierFlat");
  const healthRegen =
    (hero.base.healthRegen + statValue(itemStats, "healthRegenFlat")) *
    (1 + statValue(itemStats, "healthRegenPct") / 100);
  const outOfCombatHealthRegen = statValue(itemStats, "outOfCombatHealthRegen");
  const bulletResistPct = statValue(itemStats, "bulletResistPct");
  const spiritResistPct = statValue(itemStats, "spiritResistPct");
  const debuffResistPct = statValue(itemStats, "debuffResistPct");
  const pool = health + combatBarrier;
  const effectiveHpBullet = bulletResistPct >= 100 ? Infinity : pool / (1 - bulletResistPct / 100);
  const effectiveHpSpirit = spiritResistPct >= 100 ? Infinity : pool / (1 - spiritResistPct / 100);

  const moveSpeed =
    (hero.base.moveSpeed + statValue(itemStats, "moveSpeedFlat")) *
    (1 + statValue(itemStats, "moveSpeedPct") / 100);
  const sprintSpeed = hero.base.sprintSpeed + statValue(itemStats, "sprintSpeedFlat");
  const stamina = hero.base.stamina + statValue(itemStats, "staminaFlat");
  // deadlock.wiki/Melee_Damage: "Melee damage scales with Boons and Items. It
  // also scales with the Weapon Damage stat at a rate of 50%" — and per the
  // user, that's every source that feeds bulletDamage's own multiplier, not
  // just the item stat: Assassinate's kill stacks and the passive weapon
  // investment tier are themselves +weapon damage%, so they carry over at
  // 50% too, same as statue buffs. Melee's own base is boons-only (no
  // per-item flat additions), so this mirrors bulletDamage's multiplier
  // terms exactly, just halved and added to melee's own bonuses instead.
  const meleeWeaponDamageScaling =
    0.5 *
    (snipeStackBonus +
      weaponInvestmentPct +
      statValue(itemStats, "weaponDamagePct") / 100 +
      build.adjustables.bulletDamagePct / 100);
  const lightMelee =
    (hero.base.lightMelee + (hero.perBoon.lightMelee ?? 0) * boons) *
    (1 + statValue(itemStats, "meleeDamagePct") / 100 + meleeWeaponDamageScaling);
  const heavyMelee =
    (hero.base.heavyMelee + (hero.perBoon.heavyMelee ?? 0) * boons) *
    (1 +
      (statValue(itemStats, "meleeDamagePct") + statValue(itemStats, "heavyMeleeDamagePct")) / 100 +
      meleeWeaponDamageScaling);

  // ----------------------------------------------- chance-based extra damage ---
  // Procs are folded into the headline as an expected value per bullet - a 25%
  // chance of +100% weapon damage is worth +25% on every shot in the long run -
  // and also reported per item so each one's contribution stays visible.
  const expectedProcDps: { label: string; dps: number }[] = [];
  let procWeaponPerBullet = 0;
  let procSpiritPerBullet = 0;
  for (const r of resolved) {
    const stats: StatBag = { ...(r.item.stats ?? {}) };
    if (r.contributing) addStats(stats, r.item.conditionalStats);
    const chance = statValue(stats, "procChancePct") / 100;
    if (chance <= 0) continue;
    const weaponPart = chance * (statValue(stats, "procWeaponDamagePct") / 100) * bulletDamage;
    const spiritPart = chance * statValue(stats, "procSpiritDamageFlat") * (1 + spiritAmp);
    procWeaponPerBullet += weaponPart;
    procSpiritPerBullet += spiritPart;
    const dps =
      (weaponPart * bulletResistMul + spiritPart * spiritResistMul) *
      bulletsPerSecond *
      damageMultiplier;
    if (dps > 0) expectedProcDps.push({ label: r.item.name, dps });
  }

  // Armor Piercing Rounds: a chance for the gun's own bullets to ignore the
  // target's Bullet Resistance entirely, rather than add bonus damage like
  // every other procChancePct item. Modelled as an expected-value blend of
  // the weapon-damage resist multiplier toward 1 (fully unresisted) - not
  // toward the no-shred multiplier, since a pierce bypasses the target's
  // resist outright, so any of *your own* shred stops mattering for that
  // bullet too. Only the gun's weapon damage is affected; its spirit half and
  // ability damage still go through the normal resist untouched.
  let armorPierceChance = 0;
  for (const r of resolved) {
    if (!r.item.ignoresBulletResist) continue;
    const stats: StatBag = { ...(r.item.stats ?? {}) };
    if (r.contributing) addStats(stats, r.item.conditionalStats);
    armorPierceChance = Math.max(armorPierceChance, statValue(stats, "procChancePct") / 100);
  }
  const bulletWeaponResistMul = bulletResistMul + armorPierceChance * (1 - bulletResistMul);
  const bulletWeaponNoShredMul = bulletNoShredMul + armorPierceChance * (1 - bulletNoShredMul);

  // ------------------------------------------------------- damage rollups ---
  // "raw" is the no-shred toggle: the target's own Enemy Resist still
  // applies (it's their stat, not yours), just none of your shred sources.
  /** Combines a bullet's weapon and spirit damage under their own resists. */
  const mkDamage = (weapon: number, spirit: number): DamageSet => ({
    raw: (weapon * bulletWeaponNoShredMul + spirit * spiritNoShredMul) * damageMultiplier,
    shredded: (weapon * bulletWeaponResistMul + spirit * spiritResistMul) * damageMultiplier,
  });
  const scaleSet = (s: DamageSet, k: number): DamageSet => ({
    raw: s.raw * k,
    shredded: s.shredded * k,
  });
  const addSet = (a: DamageSet, b: DamageSet): DamageSet => ({
    raw: a.raw + b.raw,
    shredded: a.shredded + b.shredded,
  });

  const groundSpirit = bulletSpiritDamage;
  const flightSpirit = bulletSpiritDamage + flightBonusDamage;

  const perBulletGround = mkDamage(
    weaponPerBullet + procWeaponPerBullet,
    groundSpirit + procSpiritPerBullet,
  );
  const perBulletFlight = mkDamage(
    weaponPerBullet + procWeaponPerBullet,
    flightSpirit + procSpiritPerBullet,
  );

  const procPart = mkDamage(procWeaponPerBullet, procSpiritPerBullet);
  const perBulletParts = {
    ground: {
      weapon: mkDamage(weaponPerBullet, 0),
      spirit: mkDamage(0, groundSpirit),
      proc: procPart,
    },
    flight: {
      weapon: mkDamage(weaponPerBullet, 0),
      spirit: mkDamage(0, flightSpirit),
      proc: procPart,
    },
  };

  // --------------------------------------------------------------- ricochet ---
  // Bullet damage carries over at a reduced rate, spirit damage in full.
  const ricochetDamagePct = statValue(itemStats, "ricochetDamagePct");
  const ricochetTargets = statValue(itemStats, "ricochetTargets");
  const ricochetBullet = (spirit: number) =>
    mkDamage(
      (weaponPerBullet + procWeaponPerBullet) * (ricochetDamagePct / 100),
      spirit + procSpiritPerBullet,
    );
  const ricochet =
    ricochetDamagePct > 0
      ? (() => {
          const perBullet = {
            ground: ricochetBullet(groundSpirit),
            flight: ricochetBullet(flightSpirit),
          };
          const dps = {
            ground: scaleSet(perBullet.ground, bulletsPerSecond),
            flight: scaleSet(perBullet.flight, bulletsPerSecond),
          };
          return {
            damagePct: ricochetDamagePct,
            targets: ricochetTargets,
            perBullet,
            dps,
            totalDps: {
              ground: scaleSet(dps.ground, ricochetTargets),
              flight: scaleSet(dps.flight, ricochetTargets),
            },
          };
        })()
      : null;

  const timeToEmpty = bulletsPerSecond > 0 ? ammo / bulletsPerSecond : 0;
  const timeToEmptyFlight = bulletsPerSecond > 0 ? flightAmmo / bulletsPerSecond : 0;
  const groundCycle = timeToEmpty + reloadTime;
  const flightCycle = timeToEmptyFlight + reloadTime;

  const perClip = {
    ground: scaleSet(perBulletGround, ammo),
    flight: scaleSet(perBulletFlight, flightAmmo),
  };
  const burstDps = {
    ground: scaleSet(perBulletGround, bulletsPerSecond),
    flight: scaleSet(perBulletFlight, bulletsPerSecond),
  };
  const sustainedDps = {
    ground: groundCycle > 0 ? scaleSet(perClip.ground, 1 / groundCycle) : { raw: 0, shredded: 0 },
    flight: flightCycle > 0 ? scaleSet(perClip.flight, 1 / flightCycle) : { raw: 0, shredded: 0 },
  };

  // ------------------------------------------------------------- abilities ---
  const cooldownReductionPct = statValue(itemStats, "cooldownReductionPct");
  const extraCharges = statValue(itemStats, "chargesFlat");

  const abilityResults: AbilityResult[] = resolvedAbilities.map((r) => {
    const a = r.ability;
    const imbue = imbueFor(a.key);
    const abilitySpirit = spiritPower + statValue(imbue.bag, "spiritPowerFlat");
    const bonusFlat =
      statValue(imbue.bag, "abilityBonusDamage") +
      statValue(imbue.bag, "abilityBonusDamagePerSpirit") * abilitySpirit;
    const damageMul = 1 + statValue(imbue.bag, "abilityDamagePct") / 100;

    const isSpirit = (a.damageType ?? "spirit") === "spirit";
    const resistMul = a.damageType === "none" ? 1 : isSpirit ? spiritResistMul : bulletResistMul;
    const resistMulNoShred =
      a.damageType === "none" ? 1 : isSpirit ? spiritNoShredMul : bulletNoShredMul;
    const ampMul = isSpirit ? 1 + spiritAmp : 1;
    const rawScale = ampMul * damageMultiplier * damageMul * resistMulNoShred;
    const shreddedScale = ampMul * damageMultiplier * damageMul * resistMul;

    // An ability with its own headshot bonus (Assassinate's +20%) earns it at
    // the same rate the gun does. Note this is the ability's own figure, not
    // the weapon's 65%.
    const abilityHeadshot = 1 + headshotRate * ((a.headshotBonusPct ?? 0) / 100);
    const hitAmount = (r.damage + bonusFlat + a.spiritScaling * abilitySpirit) * abilityHeadshot;
    const dotAmount = (a.dotDamage ?? 0) + (a.dotSpiritScaling ?? 0) * abilitySpirit;
    const hitDamage: DamageSet = {
      raw: hitAmount * rawScale,
      shredded: hitAmount * shreddedScale,
    };
    const dotTotal: DamageSet = {
      raw: dotAmount * rawScale,
      shredded: dotAmount * shreddedScale,
    };
    const totalDamage = addSet(hitDamage, dotTotal);
    const effectiveCooldown =
      r.cooldown *
      (1 -
        Math.min(90, cooldownReductionPct + statValue(imbue.bag, "cooldownReductionPct")) / 100);
    const charges = r.charges + extraCharges + statValue(imbue.bag, "chargesFlat");
    // Charges cancel out for sustained throughput: N charges refill in N x cooldown.
    const dps: DamageSet =
      effectiveCooldown > 0 ? scaleSet(totalDamage, 1 / effectiveCooldown) : { raw: 0, shredded: 0 };
    return {
      key: a.key,
      name: a.name,
      slot: a.slot,
      hitDamage,
      dotTotal,
      totalDamage,
      dotTargetHealthPctPerSecond: a.dotTargetHealthPctPerSecond ?? 0,
      effectiveCooldown,
      charges,
      dps,
      spiritPower: abilitySpirit,
      imbuedBy: imbue.names,
      needsVerification: Boolean(a.needsVerification),
    };
  });

  // Abilities with a conditional bonus get a full damage spread, so the number
  // that actually matters — base plus bonus on a headshot — is visible.
  const damageProfiles: AbilityDamageProfile[] = [];
  for (const r of resolvedAbilities) {
    const a = r.ability;
    if (!a.bonusDamage && !a.bonusSpiritScaling) continue;
    const imbue = imbueFor(a.key);
    const abilitySpirit = spiritPower + statValue(imbue.bag, "spiritPowerFlat");
    const abilityDamageMul = 1 + statValue(imbue.bag, "abilityDamagePct") / 100;

    const isSpirit = (a.damageType ?? "spirit") === "spirit";
    const resistMul = a.damageType === "none" ? 1 : isSpirit ? spiritResistMul : bulletResistMul;
    const resistMulNoShred =
      a.damageType === "none" ? 1 : isSpirit ? spiritNoShredMul : bulletNoShredMul;
    const ampMul = (isSpirit ? 1 + spiritAmp : 1) * damageMultiplier * abilityDamageMul;
    const scale: DamageSet = {
      raw: ampMul * resistMulNoShred,
      shredded: ampMul * resistMul,
    };

    const baseAmount =
      r.damage +
      statValue(imbue.bag, "abilityBonusDamage") +
      statValue(imbue.bag, "abilityBonusDamagePerSpirit") * abilitySpirit +
      a.spiritScaling * abilitySpirit;
    const bonusAmount = r.bonusDamage + (a.bonusSpiritScaling ?? 0) * abilitySpirit;
    const base = scaleSet(scale, baseAmount);
    const bonus = scaleSet(scale, bonusAmount);
    const max = addSet(base, bonus);
    const headshotMul = 1 + (a.headshotBonusPct ?? 0) / 100;
    const unchargedMul = (a.noChargeDamagePct ?? 100) / 100;

    damageProfiles.push({
      key: a.key,
      name: a.name,
      base,
      bonus,
      bonusLabel: a.bonusLabel ?? "Conditional bonus",
      max,
      headshot: scaleSet(base, headshotMul),
      maxHeadshot: scaleSet(max, headshotMul),
      uncharged: scaleSet(base, unchargedMul),
      unchargedMax: scaleSet(max, unchargedMul),
      headshotBonusPct: a.headshotBonusPct ?? 0,
      noChargeDamagePct: a.noChargeDamagePct ?? 100,
      chargeTime: a.chargeTime ?? 0,
    });
  }

  const abilityBurstDamage = abilityResults.reduce(
    (s, a) => s + a.totalDamage.shredded * a.charges,
    0,
  );
  const abilitySustainedDps = abilityResults.reduce((s, a) => s + a.dps.shredded, 0);

  if (abilityResults.some((a) => a.needsVerification)) {
    warnings.push(
      "Some ability numbers are still placeholders. Set them in the admin panel before trusting spirit DPS.",
    );
  }
  if (abilityPointsSpent > abilityPoints) {
    warnings.push(
      `This build spends ${abilityPointsSpent} ability points but only ${abilityPoints} are available at ${boons} boons.`,
    );
  }

  // The headline DPS is burst — trigger held, reloads ignored — because that is
  // the figure the game itself quotes and the one builds are compared on.
  // `sustainedDps` carries the reload-inclusive version alongside it.
  const groundDps = burstDps.ground.shredded;
  const flightDps = burstDps.flight.shredded;
  const rangeMul = falloffMultiplier(
    build.rangeMeters,
    falloffMin,
    falloffMax,
    hero.base.falloffValue,
  );

  return {
    boons,
    abilityPoints,
    abilityPointsSpent,
    itemSouls,
    soulsByCategory,
    boonSouls,
    // Boons are earned automatically as the match runs, so they are not a
    // spend you trade against items. Net worth is what the build actually cost.
    totalSouls: itemSouls,
    itemCount: resolved.length,
    timeline,

    weaponInvestmentPct,
    vitalityInvestmentPct,
    spiritInvestmentFlat,

    baseSpiritPower,
    spiritPower,
    spiritBreakdown,
    baseGunDamage,
    bulletDamage,
    bulletSpiritDamage,
    bulletSpiritDamageSources,
    health,
    healthRegen,
    outOfCombatHealthRegen,
    combatBarrier,
    bulletResistPct,
    spiritResistPct,
    debuffResistPct,
    effectiveHpBullet,
    effectiveHpSpirit,
    lightMelee,
    heavyMelee,
    bulletsPerSecond,
    ammo,
    flightAmmo,
    reloadTime,
    bulletVelocity,
    moveSpeed,
    sprintSpeed,
    stamina,
    falloffMin,
    falloffMax,
    falloffValue: hero.base.falloffValue,

    snipeStackBonus,
    headshotRate,
    headshotBonus,
    headshotMultiplier,
    spiritAmp,
    damageMultiplier,
    bulletResistShred,
    spiritResistShred,
    shredBreakdown,
    cooldownReductionPct,

    flightBonusDamage,
    flightSpiritPower,
    flightImbuedBy: flightImbue.names,

    perBullet: { ground: perBulletGround, flight: perBulletFlight },
    perBulletParts,
    ricochet,
    perClip,
    burstDps,
    sustainedDps,
    timeToEmpty,
    timeToEmptyFlight,
    expectedProcDps,

    abilities: abilityResults,
    resolvedAbilities,
    damageProfiles,
    abilityBurstDamage,
    abilitySustainedDps,

    groundDps,
    flightDps,
    dpsAtRange: groundDps * rangeMul,
    dpsAtRangeRaw: burstDps.ground.raw * rangeMul,

    itemStats,
    resolvedItems: resolved,
    warnings,
  };
}

/** Points for the damage-vs-distance chart. */
export function falloffCurve(result: CalcResult, step = 2, maxDistance = 80) {
  const points: {
    distance: number;
    multiplier: number;
    ground: number;
    flight: number;
    /** No-shred variants, for views with a shred toggle (e.g. the single-build chart). */
    groundRaw: number;
    flightRaw: number;
  }[] = [];
  for (let d = 0; d <= maxDistance; d += step) {
    const m = falloffMultiplier(d, result.falloffMin, result.falloffMax, result.falloffValue);
    points.push({
      distance: d,
      multiplier: m,
      ground: result.groundDps * m,
      flight: result.flightDps * m,
      groundRaw: result.burstDps.ground.raw * m,
      flightRaw: result.burstDps.flight.raw * m,
    });
  }
  return points;
}

export type { Progression };
