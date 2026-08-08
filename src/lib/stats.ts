/**
 * The stat registry.
 *
 * Every number the engine understands lives here. The admin panel builds its
 * form from this list, item cards use `label`/`kind` for formatting, and the
 * wiki importer maps the game's own stat keys onto these.
 *
 * Adding a stat the game has that we do not model yet is one entry here — the
 * database needs no migration, because the flexible half of each item is a JSON
 * column. If the stat should change a calculated number, wire it into
 * `src/lib/calc/engine.ts` as well.
 */

export type StatGroup = "weapon" | "vitality" | "spirit" | "utility";

/**
 * How a raw stored number should be read:
 *  - `percent`  stored as 25 meaning +25%
 *  - `flat`     stored as 25 meaning +25 of the underlying unit
 *  - `seconds`  stored as 1.5 meaning +1.5s
 *  - `mps`      stored as 1 meaning +1 m/s
 */
export type StatKind = "percent" | "flat" | "seconds" | "mps";

export interface StatDef {
  key: string;
  label: string;
  group: StatGroup;
  kind: StatKind;
  /** Shown as help text in the admin panel. */
  hint?: string;
}

export const STAT_DEFS: StatDef[] = [
  // ---- Weapon ----
  { key: "weaponDamagePct", label: "Weapon Damage", group: "weapon", kind: "percent" },
  { key: "weaponDamageFlat", label: "Weapon Damage (flat)", group: "weapon", kind: "flat", hint: "Added to base bullet damage before percentages." },
  { key: "fireRatePct", label: "Fire Rate", group: "weapon", kind: "percent" },
  { key: "ammoPct", label: "Ammo", group: "weapon", kind: "percent" },
  { key: "ammoFlat", label: "Ammo (flat)", group: "weapon", kind: "flat" },
  { key: "reloadSpeedPct", label: "Reload Speed", group: "weapon", kind: "percent", hint: "Positive values shorten the reload." },
  { key: "bulletVelocityPct", label: "Bullet Velocity", group: "weapon", kind: "percent" },
  { key: "falloffRangePct", label: "Bullet Falloff Range", group: "weapon", kind: "percent" },
  { key: "headshotDamagePct", label: "Headshot Damage", group: "weapon", kind: "percent" },
  { key: "bulletLifestealPct", label: "Bullet Lifesteal", group: "weapon", kind: "percent" },
  { key: "meleeDamagePct", label: "Melee Damage", group: "weapon", kind: "percent" },
  { key: "heavyMeleeDamagePct", label: "Heavy Melee Damage", group: "weapon", kind: "percent" },
  { key: "weaponDamageVsNpcPct", label: "Weapon Damage vs NPCs", group: "weapon", kind: "percent", hint: "Applies to troopers and neutrals only, so it does not move hero DPS." },
  {
    key: "bulletSpiritDamageFlat",
    label: "Bonus Spirit Damage per Bullet",
    group: "weapon",
    kind: "flat",
    hint: "Added to every bullet as spirit damage, so it is reduced by spirit resist rather than bullet resist.",
  },
  {
    key: "bulletSpiritDamagePctOfBase",
    label: "Bonus Spirit Damage per Bullet",
    group: "weapon",
    kind: "percent",
    hint: "As a percentage of base gun damage. Mercurial Magnum grants 25% plus 0.49% per point of spirit power.",
  },

  // ---- Vitality ----
  { key: "bonusHealthFlat", label: "Bonus Health", group: "vitality", kind: "flat" },
  { key: "bonusHealthPct", label: "Bonus Health", group: "vitality", kind: "percent" },
  { key: "healthRegenFlat", label: "Health Regen", group: "vitality", kind: "flat", hint: "HP per second." },
  { key: "healthRegenPct", label: "Health Regen", group: "vitality", kind: "percent" },
  { key: "outOfCombatHealthRegen", label: "Out-of-Combat Regen", group: "vitality", kind: "flat" },
  { key: "bulletResistPct", label: "Bullet Resist", group: "vitality", kind: "percent" },
  { key: "spiritResistPct", label: "Spirit Resist", group: "vitality", kind: "percent" },
  { key: "meleeResistPct", label: "Melee Resist", group: "vitality", kind: "percent" },
  { key: "debuffResistPct", label: "Debuff Resist", group: "vitality", kind: "percent" },
  { key: "slowResistPct", label: "Slow Resist", group: "vitality", kind: "percent" },
  { key: "combatBarrierFlat", label: "Combat Barrier", group: "vitality", kind: "flat" },
  { key: "healingReceivedPct", label: "Healing Received", group: "vitality", kind: "percent" },
  { key: "bulletResistVsNpcPct", label: "Bullet Resist vs NPCs", group: "vitality", kind: "percent" },

  // ---- Spirit ----
  { key: "spiritPowerFlat", label: "Spirit Power", group: "spirit", kind: "flat" },
  { key: "spiritPowerPct", label: "Spirit Power", group: "spirit", kind: "percent" },
  { key: "spiritAmpPct", label: "Spirit Amp", group: "spirit", kind: "percent", hint: "Multiplies all spirit damage you deal, including Flight's bonus bullet damage." },
  { key: "cooldownReductionPct", label: "Cooldown Reduction", group: "spirit", kind: "percent" },
  { key: "abilityDurationPct", label: "Ability Duration", group: "spirit", kind: "percent" },
  { key: "abilityRangePct", label: "Ability Range", group: "spirit", kind: "percent" },
  { key: "spiritLifestealPct", label: "Spirit Lifesteal", group: "spirit", kind: "percent" },
  { key: "chargesFlat", label: "Extra Charges", group: "spirit", kind: "flat" },
  {
    key: "abilityBonusDamage",
    label: "Ability Bonus Damage",
    group: "spirit",
    kind: "flat",
    hint: "Flat damage added to one ability. On an imbue item this applies only to the ability you imbue.",
  },
  {
    key: "abilityDamagePct",
    label: "Ability Damage",
    group: "spirit",
    kind: "percent",
    hint: "On an imbue item this multiplies only the imbued ability's damage.",
  },

  // ---- Chance-based effects ----
  { key: "procChancePct", label: "Proc Chance", group: "weapon", kind: "percent", hint: "Chance per bullet that the item's bonus fires." },
  { key: "procWeaponDamagePct", label: "Proc Weapon Damage", group: "weapon", kind: "percent", hint: "Extra weapon damage on a proc, as a percentage of a normal bullet." },
  { key: "procSpiritDamageFlat", label: "Proc Spirit Damage", group: "weapon", kind: "flat", hint: "Flat spirit damage dealt on a proc." },

  // ---- Ricochet ----
  {
    key: "ricochetDamagePct",
    label: "Ricochet Damage",
    group: "weapon",
    kind: "percent",
    hint: "Share of your bullet damage passed to each nearby enemy. Spirit damage always carries over in full.",
  },
  { key: "ricochetTargets", label: "Ricochet Targets", group: "weapon", kind: "flat" },

  // ---- Utility ----
  { key: "moveSpeedFlat", label: "Move Speed", group: "utility", kind: "mps" },
  { key: "moveSpeedPct", label: "Move Speed", group: "utility", kind: "percent" },
  { key: "sprintSpeedFlat", label: "Sprint Speed", group: "utility", kind: "mps" },
  { key: "staminaFlat", label: "Stamina", group: "utility", kind: "flat" },
  { key: "staminaRecoveryPct", label: "Stamina Recovery", group: "utility", kind: "percent" },
];

export const STAT_BY_KEY: Record<string, StatDef> = Object.fromEntries(
  STAT_DEFS.map((d) => [d.key, d]),
);

export const STAT_GROUP_LABELS: Record<StatGroup, string> = {
  weapon: "Weapon",
  vitality: "Vitality",
  spirit: "Spirit",
  utility: "Utility",
};

/** A bag of stat values, keyed by `StatDef.key`. Missing means zero. */
export type StatBag = Record<string, number>;

export function addStats(target: StatBag, source: StatBag | undefined, multiplier = 1): StatBag {
  if (!source) return target;
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== "number" || Number.isNaN(value)) continue;
    target[key] = (target[key] ?? 0) + value * multiplier;
  }
  return target;
}

export function statValue(bag: StatBag | undefined, key: string): number {
  return bag?.[key] ?? 0;
}

/** Formats a stat for display, e.g. `+25%`, `+150`, `+1.2 m/s`. */
export function formatStat(key: string, value: number): string {
  const def = STAT_BY_KEY[key];
  const rounded = Math.round(value * 100) / 100;
  const sign = rounded > 0 ? "+" : "";
  switch (def?.kind) {
    case "percent":
      return `${sign}${rounded}%`;
    case "mps":
      return `${sign}${rounded} m/s`;
    case "seconds":
      return `${sign}${rounded}s`;
    default:
      return `${sign}${rounded}`;
  }
}

export function statLabel(key: string): string {
  return STAT_BY_KEY[key]?.label ?? key;
}

/** Humanises a raw game stat key for the display-only info rows. */
export function humaniseGameKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\bTech\b/g, "Spirit")
    .replace(/\bPercent\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
