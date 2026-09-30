import { describe, expect, it } from "vitest";
import { calculateBuild, resolveItems } from "./engine";
import { addItemToBuild, createBuild, createBuildItem } from "../build";
import { availableDownsides, corruptedMaxStacks, corruptedRowValue } from "../corruption";
import { SEED_HERO, SEED_ITEMS, SEED_PROGRESSION } from "../data/seed";
import type { BuildItem, Item } from "../types";

const baseItem: Omit<Item, "tier" | "corruption"> = {
  id: "1",
  slug: "test-item",
  name: "Test Item",
  category: "Weapon",
  cost: 1000,
  activation: "Passive",
  iconUrl: null,
  components: [],
  shopFilters: [],
  stats: { weaponDamagePct: 10 },
  enabled: true,
  sortOrder: 0,
};

function itemAt(tier: number, corruption: Item["corruption"] = {}): Item {
  return { ...baseItem, tier, corruption };
}

function corrupt(item: Item, patch: Partial<BuildItem> = {}): BuildItem {
  return { ...createBuildItem(item), corrupted: true, corruptionDownsideId: null, ...patch };
}

function resolve(item: Item, entry: BuildItem) {
  return resolveItems(createBuild(), [item], [entry])[0];
}

describe("corruption mechanics", () => {
  it("leaves an uncorrupted item's stats untouched", () => {
    const item = itemAt(3, { stats: { weaponDamagePct: 20 } });
    expect(resolve(item, createBuildItem(item)).item.stats.weaponDamagePct).toBe(10);
  });

  it("adds the item's own corruption upgrade when corrupted", () => {
    const item = itemAt(3, { stats: { weaponDamagePct: 20 } });
    expect(resolve(item, corrupt(item)).item.stats.weaponDamagePct).toBe(30);
  });

  it("uses the tier-appropriate downside magnitude", () => {
    const t3 = itemAt(3);
    const t4 = itemAt(4);
    expect(resolve(t3, corrupt(t3, { corruptionDownsideId: "MoveSpeed" })).item.stats.moveSpeedFlat).toBe(-2);
    expect(resolve(t4, corrupt(t4, { corruptionDownsideId: "MoveSpeed" })).item.stats.moveSpeedFlat).toBe(-2.75);
  });

  it("ignores the corrupted flag on a tier the Broker can't touch", () => {
    const item = itemAt(2, { stats: { weaponDamagePct: 999 } });
    const r = resolve(item, corrupt(item, { corruptionDownsideId: "MoveSpeed" }));
    expect(r.item.stats.weaponDamagePct).toBe(10);
    expect(r.item.stats.moveSpeedFlat).toBeUndefined();
  });

  it("never applies a downside the item excludes", () => {
    const item = itemAt(3, { excludedPenalties: ["FireRate"] });
    expect(availableDownsides(item).map((p) => p.id)).not.toContain("FireRate");
    const r = resolve(item, corrupt(item, { corruptionDownsideId: "FireRate" }));
    expect(r.item.stats.fireRatePct).toBeUndefined();
  });

  it("rolls the upgrade and the downside independently", () => {
    const item = itemAt(3, { stats: { weaponDamagePct: 20 } });
    const r = resolve(
      item,
      corrupt(item, {
        corruptionDownsideId: "MoveSpeed",
        corruptionUpgradeRoll: "high",
        corruptionDownsideRoll: "high",
      }),
    );
    // High upgrade: +15% of the *bonus*, not of the whole stat.
    expect(r.item.stats.weaponDamagePct).toBeCloseTo(10 + 20 * 1.15, 5);
    // High downside: the harshest penalty.
    expect(r.item.stats.moveSpeedFlat).toBeCloseTo(-2 * 1.15, 5);

    const low = resolve(
      item,
      corrupt(item, { corruptionDownsideId: "MoveSpeed", corruptionUpgradeRoll: "low", corruptionDownsideRoll: "low" }),
    );
    expect(low.item.stats.weaponDamagePct).toBeCloseTo(10 + 20 * 0.85, 5);
    expect(low.item.stats.moveSpeedFlat).toBeCloseTo(-2 * 0.85, 5);
  });

  it("never rolls a fixed bonus", () => {
    const item = itemAt(4, { fixed: { stats: { ricochetTargets: 1 } } });
    const r = resolve(item, corrupt(item, { corruptionUpgradeRoll: "low" }));
    expect(r.item.stats.ricochetTargets).toBe(1);
  });

  it("adds corrupted shred to the item's own shred", () => {
    const item: Item = { ...itemAt(3), shred: { bullet: 0.07 }, corruption: { shred: { bullet: 0.05 } } };
    expect(resolve(item, corrupt(item)).item.shred?.bullet).toBeCloseTo(0.12, 5);
  });

  it("raises the stack cap, rounded to a whole stack at every roll", () => {
    const item: Item = {
      ...itemAt(4),
      perStack: { fireRatePct: 11 },
      maxStacks: 6,
      corruption: { perStack: { fireRatePct: 7 }, maxStacksDelta: 2 },
    };
    for (const roll of ["low", "average", "high"] as const) {
      const r = resolve(item, corrupt(item, { corruptionUpgradeRoll: roll, stacks: 8 }));
      expect(r.item.maxStacks).toBe(8);
      expect(r.stacks).toBe(8);
    }
    const uncorrupted = resolve(item, { ...createBuildItem(item), stacks: 8 });
    expect(uncorrupted.item.maxStacks).toBe(6);
    expect(uncorrupted.stacks).toBe(6);
  });
});

describe("corruption on the live catalogue", () => {
  const bySlug = new Map(SEED_ITEMS.map((i) => [i.slug, i]));
  const ctx = { hero: SEED_HERO, items: SEED_ITEMS, progression: SEED_PROGRESSION };

  it("covers exactly the Tier 3 and 4 items", () => {
    const tiers = SEED_ITEMS.filter((i) => i.corruption).map((i) => i.tier);
    expect(new Set(tiers)).toEqual(new Set([3, 4]));
    expect(SEED_ITEMS.filter((i) => (i.tier === 3 || i.tier === 4) && !i.corruption)).toEqual([]);
  });

  it("matches the game's own corrupted Spellslinger (18% fire rate/stack, 8 stacks, 18% CDR)", () => {
    const item = bySlug.get("spellslinger")!;
    const r = resolve(item, corrupt(item, { stacks: 8 }));
    expect(r.item.maxStacks).toBe(8);
    expect(r.item.perStack?.fireRatePct).toBe(18);
    expect(r.item.stats.cooldownReductionPct).toBe(18);
    expect(corruptedMaxStacks(item, corrupt(item))).toBe(8);
  });

  it("corrupts proc damage, not just proc chance (Tesla Bullets)", () => {
    const item = bySlug.get("tesla-bullets")!;
    const base = resolve(item, createBuildItem(item)).item.stats;
    const r = resolve(item, corrupt(item)).item.stats;
    expect(r.procSpiritDamageFlat! - base.procSpiritDamageFlat!).toBe(47);
    expect(r.procChancePct! - base.procChancePct!).toBe(5);
  });

  it("corrupted row values match the game's displayed corrupted numbers", () => {
    const rows = bySlug.get("alchemical-fire")!.corruption!.rows!;
    const sp = rows.find((r) => r.key === "SpiritPower")!;
    // statlocker.gg's per-match range for this row: 27 to 33.
    expect(corruptedRowValue(sp, "low")).toBe(27);
    expect(corruptedRowValue(sp, "average")).toBe(30);
    expect(corruptedRowValue(sp, "high")).toBe(33);
  });

  it("corrupting a gun item raises DPS, and its weapon-damage downside lowers it", () => {
    let build = createBuild({ boons: 27 });
    build = addItemToBuild(build, bySlug.get("tesla-bullets")!);
    build = { ...build, soulsEarned: 50000 };
    const plain = calculateBuild(build, ctx).burstDps.ground.shredded;

    const withCorruption = (patch: Partial<BuildItem>) =>
      calculateBuild(
        { ...build, items: build.items.map((i) => ({ ...i, corrupted: true, ...patch })) },
        ctx,
      ).burstDps.ground.shredded;

    const harmless = withCorruption({ corruptionDownsideId: "Stamina" });
    const crippling = withCorruption({ corruptionDownsideId: "WeaponDamage" });
    expect(harmless).toBeGreaterThan(plain);
    expect(crippling).toBeLessThan(harmless);
  });
});
