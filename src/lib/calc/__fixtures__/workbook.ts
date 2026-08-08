/**
 * A frozen copy of the state "Zag's Gundicta DPS Calculator" shipped with.
 *
 * The live seed now tracks the current patch via deadlock.wiki, so it drifts
 * from the workbook (gun damage per boon moved 0.49 → 0.495, health per boon
 * 29 → 28, several item stats changed). Pinning the workbook's own numbers here
 * keeps the parity tests meaningful: they prove the *engine* still reproduces
 * the spreadsheet, independently of how the game has been patched since.
 */
import type { HeroConfig, Item, Progression } from "../../types";
import { SEED_PROGRESSION } from "../../data/seed";

export const WORKBOOK_HERO: HeroConfig = {
  slug: "vindicta",
  name: "Vindicta",
  maxBoons: 35,
  gunDamageSpiritScaling: 0.022,
  headshotBonusPct: 65,
  base: {
    gunDamage: 12.33,
    bulletsPerSecond: 4.33,
    ammo: 19,
    reloadTime: 2.91,
    bulletVelocity: 660,
    spiritPower: 0,
    health: 755,
    healthRegen: 1.5,
    lightMelee: 50,
    heavyMelee: 116,
    moveSpeed: 7,
    sprintSpeed: 2,
    dashSpeed: 14.7,
    stamina: 3,
    staminaCooldown: 4.5,
    falloffMin: 20,
    falloffMax: 64,
    falloffValue: 0.9,
  },
  perBoon: { gunDamage: 0.49, spiritPower: 1.1, health: 29 },
  abilities: [
    {
      key: "flight",
      name: "Flight",
      slot: 2,
      baseDamage: 0,
      spiritScaling: 0,
      cooldown: 42,
      damageType: "none",
      effects: { flightBaseDamage: 10, flightSpiritScaling: 0.18 },
      upgrades: [
        { tier: 1, cost: 1, description: "+50% base Ammo while flying", effects: { flightAmmoMultiplier: 1.5 } },
        { tier: 2, cost: 2, description: "+10s Duration" },
        { tier: 3, cost: 5, description: "+10 Spirit Damage", effects: { flightBaseDamage: 20, flightSpiritScaling: 0.28 } },
      ],
    },
    {
      key: "crow-familiar",
      name: "Crow Familiar",
      slot: 3,
      baseDamage: 0,
      spiritScaling: 0,
      cooldown: 32,
      damageType: "spirit",
      effects: { bulletResistShred: 0.06, spiritResistShred: 0.06 },
      upgrades: [
        { tier: 1, cost: 1, description: "Healing reduction" },
        { tier: 2, cost: 2, description: "-16s Cooldown" },
        { tier: 3, cost: 5, description: "-8% resists", effects: { bulletResistShred: 0.14, spiritResistShred: 0.14 } },
      ],
    },
    {
      key: "assassinate",
      name: "Assassinate",
      slot: 4,
      baseDamage: 0,
      spiritScaling: 0,
      cooldown: 55,
      damageType: "spirit",
      effects: { gunDamagePerStack: 0.06 },
      upgrades: [
        { tier: 1, cost: 1, description: "-15s Cooldown" },
        { tier: 2, cost: 2, description: "+80 Max Bonus Damage" },
        { tier: 3, cost: 5, description: "+4% Weapon Damage Per Kill", effects: { gunDamagePerStack: 0.1 } },
      ],
    },
  ],
};

function item(
  slug: string,
  name: string,
  category: Item["category"],
  cost: number,
  stats: Record<string, number>,
  extra: Partial<Item> = {},
): Item {
  return {
    id: slug,
    slug,
    name,
    category,
    cost,
    tier: { 800: 1, 1600: 2, 3200: 3, 6400: 4 }[cost] ?? 1,
    activation: "Passive",
    iconUrl: null,
    components: [],
    shopFilters: [],
    stats,
    enabled: true,
    sortOrder: 0,
    ...extra,
  };
}

/** The twelve items the workbook had selected, with the stats it used. */
export const WORKBOOK_ITEMS: Item[] = [
  item("fleetfoot", "Fleetfoot", "Weapon", 1600, { weaponDamagePct: 6 }),
  item("blood-tribute", "Blood Tribute", "Weapon", 3200, { fireRatePct: 35 }),
  item("burst-fire", "Burst Fire", "Weapon", 3200, { fireRatePct: 42 }),
  item("sharpshooter", "Sharpshooter", "Weapon", 3200, {
    weaponDamagePct: 70,
    bulletVelocityPct: 60,
    falloffRangePct: 20,
  }),
  item("armor-piercing-rounds", "Armor Piercing Rounds", "Weapon", 6400, {
    weaponDamagePct: 8,
    bulletVelocityPct: 60,
  }),
  item("spellslinger", "Spellslinger", "Weapon", 6400, {}, {
    perStack: { fireRatePct: 11, reloadSpeedPct: 10 },
    maxStacks: 6,
    defaultStacks: 6,
  }),
  item("counterspell", "Counterspell", "Vitality", 3200, { spiritPowerFlat: 5 }),
  item("vampiric-burst", "Vampiric Burst", "Vitality", 6400, {
    weaponDamagePct: 6,
    fireRatePct: 34,
    ammoPct: 75,
  }),
  item("extra-charge", "Extra Charge", "Spirit", 800, {}),
  item("mystic-burst", "Mystic Burst", "Spirit", 800, {}),
  item("improved-spirit", "Improved Spirit", "Spirit", 1600, { spiritPowerFlat: 18 }),
  item("quicksilver-reload", "Quicksilver Reload", "Spirit", 1600, { fireRatePct: 10 }),

  // Not selected in the workbook, but referenced by tests that check the
  // damage-multiplier and shred rules.
  item("cursed-relic", "Cursed Relic", "Spirit", 6400, {}, { damageMultiplier: 0.86 }),
  item("golden-goose-egg", "Golden Goose Egg", "Spirit", 800, {}, { damageMultiplier: 0.9 }),
  item("spirit-rend", "Spirit Rend", "Weapon", 3200, {}, {
    shred: { spirit: 0.08, perStackSpirit: 0.07 },
    maxStacks: 4,
    defaultStacks: 4,
  }),
  item("cultist-sacrifice", "Cultist Sacrifice", "Weapon", 3200, { fireRatePct: 10 }, {
    perBoon: { fireRatePct: 0.8 },
  }),
  item(
    "mercurial-magnum",
    "Mercurial Magnum",
    "Spirit",
    6400,
    { fireRatePct: 22, ammoPct: 20, spiritPowerFlat: 7, bulletSpiritDamagePctOfBase: 25 },
    { perSpirit: { bulletSpiritDamagePctOfBase: 0.49 } },
  ),
];

export const WORKBOOK_PROGRESSION: Progression = SEED_PROGRESSION;

/** The twelve items the workbook had ticked, in sheet order. */
export const WORKBOOK_SELECTED = [
  "fleetfoot",
  "blood-tribute",
  "burst-fire",
  "sharpshooter",
  "armor-piercing-rounds",
  "spellslinger",
  "counterspell",
  "vampiric-burst",
  "extra-charge",
  "mystic-burst",
  "improved-spirit",
  "quicksilver-reload",
];
