import type { StatBag } from "./stats";

export type ItemCategory = "Weapon" | "Vitality" | "Spirit";

export const ITEM_CATEGORIES: ItemCategory[] = ["Weapon", "Vitality", "Spirit"];

/** How an item is used. Mirrors the game's own `Activation` field. */
export type Activation = "Passive" | "InstantCast" | "Press" | "InstantCastToggle";

export const ACTIVATION_LABELS: Record<Activation, string> = {
  Passive: "Passive",
  InstantCast: "Active",
  Press: "Active",
  InstantCastToggle: "Toggle",
};

export const TIER_LABELS: Record<number, string> = {
  1: "Tier 1",
  2: "Tier 2",
  3: "Tier 3",
  4: "Tier 4",
  5: "Legendary",
};

/**
 * Resist shred granted by an item. Shred stacks multiplicatively across
 * sources: total = 1 - Π(1 - shred_i), matching the workbook's
 * `=1-PRODUCT(IF(J31:J43=TRUE, 1-H31:H43, 1))`.
 */
export interface ShredSpec {
  /** Flat bullet resist shred, e.g. 0.16 for 16%. */
  bullet?: number;
  /** Flat spirit resist shred. */
  spirit?: number;
  /** Bullet shred that scales with spirit power: bullet + spirit * scaling. */
  bulletPerSpirit?: number;
  spiritPerSpirit?: number;
  /**
   * Extra shred per stack. Each stack is its own multiplicative factor, which
   * is how the game models Spirit Rend's four stack rows.
   */
  perStackBullet?: number;
  perStackSpirit?: number;
}

/** A number the game shows on an item that the engine does not model. */
export interface InfoRow {
  key: string;
  value: string | number | null;
  type?: string | null;
  conditional?: boolean;
  /** Headline numbers the game renders larger. */
  emphasis?: boolean;
}

/** One of the boxes the game draws on an item card. */
export interface InfoBlock {
  type: string;
  cooldown?: number | null;
  chargeUp?: number | null;
  rows: InfoRow[];
}

export interface Item {
  id: string;
  slug: string;
  /** The game's own identifier, e.g. `upgrade_sharpshooter`. */
  gameKey?: string;
  name: string;
  category: ItemCategory;
  /** Soul cost. Tier 5 legendaries are listed at 9999. */
  cost: number;
  tier: number;
  activation: Activation;
  iconUrl: string | null;
  description?: string | null;
  /** Slugs of the items this one is built from; they are consumed on purchase. */
  components: string[];
  /** The game's shop filter tags, used for the filter chips. */
  shopFilters: string[];
  isImbue?: boolean;
  /**
   * Stats that apply only to the ability this item is imbued into, rather than
   * to the hero. Compress Cooldown shortens one cooldown, not all of them.
   */
  imbuedStats?: StatBag;
  /** Stats that always apply. */
  stats: StatBag;
  /**
   * Stats the game marks `ConditionallyApplied`. They only count when the
   * build's toggle for this item is on.
   */
  conditionalStats?: StatBag;
  /** Stats granted per stack, multiplied by the build's stack count. */
  perStack?: StatBag;
  /** Stats granted per hero boon. */
  perBoon?: StatBag;
  /** Stats granted per point of spirit power. */
  perSpirit?: StatBag;
  maxStacks?: number;
  defaultStacks?: number;
  stackLabel?: string;
  /** Label and default for the situational toggle. */
  conditional?: { label: string; defaultActive: boolean };
  shred?: ShredSpec;
  /**
   * False when the shred sits behind its own cooldown, so it is a brief window
   * rather than something you can assume is on the target.
   */
  defaultShredActive?: boolean;
  /** Multiplier on all outgoing damage, e.g. 0.9 for Golden Goose Egg. */
  damageMultiplier?: number;
  /**
   * Armor Piercing Rounds: `stats.procChancePct` is the chance for a gun
   * bullet's weapon damage to ignore the target's Bullet Resistance entirely,
   * rather than add bonus damage like every other `procChancePct` item. The
   * export gives no way to tell the two apart, so this is opted in per item.
   */
  ignoresBulletResist?: boolean;
  /** Numbers the game displays that the engine does not consume. */
  info?: InfoBlock[];
  notes?: string;
  enabled: boolean;
  sortOrder: number;
}

export interface AbilityEffects {
  /** Bullet/spirit resist shred applied by the ability (Crow Familiar). */
  bulletResistShred?: number;
  spiritResistShred?: number;
  /** Bonus gun damage per stack (Assassinate's per-kill weapon damage). */
  gunDamagePerStack?: number;
  /** Bonus spirit damage per bullet while flying: base + spirit * scaling. */
  flightBaseDamage?: number;
  flightSpiritScaling?: number;
  /** Multiplier on magazine size while the ability is active (Flight). */
  flightAmmoMultiplier?: number;
}

/** One of an ability's three purchasable upgrades. */
export interface AbilityUpgrade {
  /** 1, 2 or 3 — the order they appear on the ability card. */
  tier: 1 | 2 | 3;
  /** Ability points it costs: 1, 2 and 5 in Deadlock. */
  cost: number;
  /** The game's own wording, shown as the toggle's tooltip. */
  description: string;
  /** Mechanical changes the engine applies when this upgrade is taken. */
  effects?: AbilityEffects;
  /** Deltas applied to the ability's own numbers. */
  damageDelta?: number;
  bonusDamageDelta?: number;
  cooldownDelta?: number;
  chargesDelta?: number;
}

export interface Ability {
  key: string;
  name: string;
  /** Ability slot order, 1-4. */
  slot: number;
  iconUrl?: string | null;
  /** Direct damage: base + spirit * spiritScaling. */
  baseDamage: number;
  spiritScaling: number;
  /** Damage-over-time component, applied over `dotDuration` seconds. */
  dotDamage?: number;
  dotSpiritScaling?: number;
  dotDuration?: number;
  /** Damage per second as a percentage of the target's current health. */
  dotTargetHealthPctPerSecond?: number;
  /**
   * Conditional extra damage, e.g. Assassinate's bonus against targets below
   * half health. Reported separately so the maximum is visible.
   */
  bonusDamage?: number;
  bonusSpiritScaling?: number;
  bonusLabel?: string;
  /** Extra damage on a headshot, as a percentage. */
  headshotBonusPct?: number;
  /** Damage dealt before the shot is fully charged, as a percentage. */
  noChargeDamagePct?: number;
  chargeTime?: number;
  cooldown: number;
  charges?: number;
  castTime?: number;
  duration?: number;
  /** Whether the ability's damage counts as spirit or weapon damage. */
  damageType?: "spirit" | "weapon" | "none";
  /** Effects that apply as soon as the ability is unlocked. */
  effects?: AbilityEffects;
  upgrades?: AbilityUpgrade[];
  /** Values are placeholders until confirmed against the live game. */
  needsVerification?: boolean;
  notes?: string;
}

export interface HeroBaseStats {
  gunDamage: number;
  bulletsPerSecond: number;
  ammo: number;
  reloadTime: number;
  bulletVelocity: number;
  spiritPower: number;
  health: number;
  healthRegen: number;
  lightMelee: number;
  heavyMelee: number;
  moveSpeed: number;
  sprintSpeed: number;
  dashSpeed: number;
  stamina: number;
  staminaCooldown: number;
  falloffMin: number;
  falloffMax: number;
  /** Fraction of damage lost at maximum falloff distance, e.g. 0.9 → 10% damage. */
  falloffValue: number;
}

export interface HeroConfig {
  slug: string;
  name: string;
  base: HeroBaseStats;
  /** Stat gained per hero boon (level). */
  perBoon: {
    gunDamage: number;
    spiritPower: number;
    health: number;
    lightMelee?: number;
    heavyMelee?: number;
  };
  /** Gun damage gained per point of spirit power. */
  gunDamageSpiritScaling: number;
  /**
   * Extra weapon damage on a headshot, as a percentage. Items adding headshot
   * damage stack on top of this. Spirit damage riding on a bullet gets nothing.
   */
  headshotBonusPct: number;
  maxBoons: number;
  abilities: Ability[];
}

export interface InvestmentRow {
  souls: number;
  weaponPct: number;
  vitalityPct: number;
  spiritFlat: number;
}

export interface BoonRow {
  souls: number;
  boons: number;
  abilityPoints: number;
  note?: string | null;
}

export interface Progression {
  investment: InvestmentRow[];
  boons: BoonRow[];
}

/** An item as placed in a build. */
export interface BuildItem {
  slug: string;
  /** For conditional items: whether the situational bonus is counted. */
  active: boolean;
  /** For stacking items: current stack count. */
  stacks: number;
  /** For shred sources: whether the shred is being applied to the target. */
  shredActive: boolean;
}

/** Manually-entered buffs the workbook exposed as "Statue Buffs" / adjustables. */
export interface BuildAdjustables {
  fireRatePct: number;
  bulletDamagePct: number;
  spiritPowerFlat: number;
  ammoPct: number;
}

export interface Build {
  id: string;
  name: string;
  heroSlug: string;
  createdAt: number;
  updatedAt: number;
  /**
   * Souls earned at the point in the match being modelled. Drives which
   * purchases have happened and, unless overridden, how many boons you have.
   */
  soulsEarned: number;
  /** Hero boons (levels), 0-35. Ignored unless `boonsFromSouls` is off. */
  boons: number;
  /** When true, boons are read from the boon table using `soulsEarned`. */
  boonsFromSouls: boolean;
  /** Assassinate stacks currently held. */
  snipeStacks: number;
  /** Share of bullets that hit the head, 0-100. */
  headshotRate: number;
  /**
   * The target's own resist, 0-100, before your shred is subtracted from it.
   * Bullet and spirit are tracked separately, same as your own shred — a
   * target can be built to resist one and not the other. Deadlock resist and
   * shred each stack multiplicatively within themselves, then shred is
   * subtracted from resist — see deadlock.wiki/Damage_Resistance. Both
   * default to 0, which reproduces the app's original behaviour (shred read
   * as pure damage amp against an unarmored target).
   */
  enemyBulletResistPct: number;
  enemySpiritResistPct: number;
  /**
   * Which ability upgrades are taken, as `{ abilityKey: [t1, t2, t3] }`.
   * Replaces the old crowT3 / flightT3 / snipeT3 booleans.
   */
  abilityUpgrades: Record<string, boolean[]>;
  /** Whether Crow Familiar's resist shred is counted as applied to the target. */
  crowShredActive: boolean;
  /**
   * The workbook scales gun damage off *pre-item* spirit power only, so items
   * granting spirit power do not feed the gun-damage scaling. Enable this to use
   * total spirit power instead. Off by default for workbook parity.
   */
  gunDamageUsesTotalSpirit: boolean;
  /** The purchase plan, in buy order. */
  items: BuildItem[];
  /**
   * Items to sell, in the order they should go, whenever a purchase needs a
   * slot and all twelve are full.
   */
  sellOrder: string[];
  /** Which ability each imbue item is assigned to, as `{ itemSlug: abilityKey }`. */
  imbueTargets: Record<string, string>;
  adjustables: BuildAdjustables;
  notes: string;
  /** Distance in metres used for the "at range" readouts. */
  rangeMeters: number;
  color: string;
}

/** Everything the engine needs that is not the build itself. */
export interface CalcContext {
  hero: HeroConfig;
  items: Item[];
  progression: Progression;
}
