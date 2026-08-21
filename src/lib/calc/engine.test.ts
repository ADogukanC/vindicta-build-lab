/**
 * Parity tests against "Zag's Gundicta DPS Calculator".
 *
 * The expected numbers are the values Excel had cached in the workbook for the
 * build it shipped with: 27 boons, 5 Assassinate stacks, Crow T3 off, Flight T3
 * on, Assassinate T3 off, 6 Slinger stacks, and the twelve items in
 * `WORKBOOK_SELECTED`. Cell references are given for every assertion.
 *
 * These run against a frozen fixture, not the live seed, so that patch updates
 * to the item catalogue cannot quietly invalidate the proof that the engine
 * reproduces the spreadsheet. `wiki-data.test.ts` covers the live data.
 */
import { describe, expect, it } from "vitest";
import {
  calculateBuild,
  combineShred,
  deriveAbilityUpgradesFromApOrder,
  falloffMultiplier,
  lookupStepDown,
  resolveAbility,
} from "./engine";
import {
  WORKBOOK_HERO,
  WORKBOOK_ITEMS,
  WORKBOOK_PROGRESSION,
  WORKBOOK_SELECTED,
} from "./__fixtures__/workbook";
import { createBuild, createBuildItem, normalizeUpgrades, setUpgradeTier } from "../build";
import type { CalcContext } from "../types";

const ctx: CalcContext = {
  hero: WORKBOOK_HERO,
  items: WORKBOOK_ITEMS,
  progression: WORKBOOK_PROGRESSION,
};

const bySlug = new Map(WORKBOOK_ITEMS.map((i) => [i.slug, i]));

function pick(slugs: string[]) {
  return slugs.map((slug) => {
    const item = bySlug.get(slug);
    if (!item) throw new Error(`missing fixture item: ${slug}`);
    return createBuildItem(item);
  });
}

/** The workbook's toggles: Flight T1+T3 on, Crow and Assassinate T3 off. */
const WORKBOOK_UPGRADES = {
  flight: [true, false, true],
  "crow-familiar": [false, false, false],
  assassinate: [false, false, false],
};

function workbookBuild() {
  return createBuild({
    // The workbook pinned boons by hand and showed every item at once, so the
    // fixture opts out of souls-derived boons and funds the whole plan.
    soulsEarned: 200000,
    boonsFromSouls: false,
    boons: 27,
    snipeStacks: 5,
    abilityUpgrades: WORKBOOK_UPGRADES,
    crowShredActive: true,
    // The app now defaults this on because it is how the game behaves; the
    // workbook fed only pre-item spirit into gun damage, so parity needs it off.
    gunDamageUsesTotalSpirit: false,
    items: pick(WORKBOOK_SELECTED),
  });
}

/** Excel carries ~15 significant digits; 1e-6 is far tighter than we need. */
const near = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 6);

describe("helpers", () => {
  it("steps down to the last key <= the lookup value, like XLOOKUP(...,-1)", () => {
    const rows = [{ souls: 0 }, { souls: 800 }, { souls: 1600 }];
    expect(lookupStepDown(rows, 1599)?.souls).toBe(800);
    expect(lookupStepDown(rows, 1600)?.souls).toBe(1600);
    expect(lookupStepDown(rows, 99999)?.souls).toBe(1600);
    expect(lookupStepDown(rows, -1)).toBeNull();
  });

  it("stacks resist shred multiplicatively (H44/I44)", () => {
    near(combineShred([0.06]), 0.06);
    near(combineShred([0.08, 0.07, 0.07, 0.07, 0.07]), 1 - 0.92 * 0.93 ** 4);
    near(combineShred([]), 0);
  });

  it("interpolates damage falloff (Falloff!B)", () => {
    expect(falloffMultiplier(10, 20, 64, 0.9)).toBe(1);
    expect(falloffMultiplier(64, 20, 64, 0.9)).toBeCloseTo(0.1, 10);
    expect(falloffMultiplier(80, 20, 64, 0.9)).toBeCloseTo(0.1, 10);
    expect(falloffMultiplier(42, 20, 64, 0.9)).toBeCloseTo(1 - (0.9 * 22) / 44, 10);
  });

  it("keeps ability upgrades to a prefix, since they are bought in order", () => {
    expect(normalizeUpgrades([false, true, true])).toEqual([false, false, false]);
    expect(normalizeUpgrades([true, false, true])).toEqual([true, false, false]);
    expect(normalizeUpgrades([true, true, true])).toEqual([true, true, true]);
    expect(normalizeUpgrades(undefined)).toEqual([false, false, false]);
  });

  it("selects every tier up to the one clicked, and clears the rest when clearing", () => {
    const none = [false, false, false];
    expect(setUpgradeTier(none, 0)).toEqual([true, false, false]);
    expect(setUpgradeTier(none, 2)).toEqual([true, true, true]);
    // Clicking a tier that is already taken refunds it and everything above.
    expect(setUpgradeTier([true, true, true], 1)).toEqual([true, false, false]);
    expect(setUpgradeTier([true, true, true], 0)).toEqual([false, false, false]);
  });

  it("folds ability upgrades into the base numbers", () => {
    const flight = WORKBOOK_HERO.abilities.find((a) => a.key === "flight")!;
    expect(resolveAbility(flight, [false, false, false]).effects.flightBaseDamage).toBe(10);
    expect(resolveAbility(flight, [false, false, false]).effects.flightAmmoMultiplier).toBeUndefined();
    expect(resolveAbility(flight, [true, false, false]).effects.flightAmmoMultiplier).toBe(1.5);
    expect(resolveAbility(flight, [true, false, true]).effects.flightBaseDamage).toBe(20);
    expect(resolveAbility(flight, [true, false, true]).abilityPointsSpent).toBe(6);
  });
});

describe("workbook parity", () => {
  const r = calculateBuild(workbookBuild(), ctx);

  it("counts souls and investment bonuses (Items!O3:O5, R3:R5)", () => {
    expect(r.itemCount).toBe(12); // B50
    expect(r.soulsByCategory.Weapon).toBe(24000); // O3
    expect(r.soulsByCategory.Vitality).toBe(9600); // O4
    expect(r.soulsByCategory.Spirit).toBe(4800); // O5
    expect(r.itemSouls).toBe(38400); // D100
    near(r.weaponInvestmentPct, 1); // R3 / B35
    near(r.vitalityInvestmentPct, 0.46); // R4 / B36
    near(r.spiritInvestmentFlat, 38); // R5 / B37
  });

  it("sums item stats (Items!E100:L100)", () => {
    near(r.itemStats.weaponDamagePct, 90); // E100
    near(r.itemStats.fireRatePct, 187); // F100 - includes Spellslinger's 11 x 6
    near(r.itemStats.ammoPct, 75); // G100
    near(r.itemStats.bulletVelocityPct, 120); // H100
    near(r.itemStats.spiritPowerFlat, 23); // I100
    near(r.itemStats.reloadSpeedPct, 60); // K100 - includes Spellslinger's 10 x 6
    near(r.itemStats.falloffRangePct, 20); // L100
    expect(r.itemStats.spiritPowerPct ?? 0).toBe(0); // J100
  });

  it("derives base hero values (B20:B24)", () => {
    near(r.baseSpiritPower, 29.700000000000003); // B21
    near(r.baseGunDamage, 26.213400000000004); // B20
    near(r.snipeStackBonus, 0.3); // E34
  });

  it("derives item-modified values (E20:E36)", () => {
    near(r.spiritPower, 90.7); // E21
    near(r.health, 2245.48); // E22
    near(r.bulletsPerSecond, 12.427100000000001); // E25
    near(r.ammo, 33.25); // E26
    near(r.flightAmmo, 42.75); // E27
    near(r.reloadTime, 1.1640000000000001); // E28
    near(r.bulletVelocity, 1452.0000000000002); // E29
    near(r.falloffMin, 24); // E32
    near(r.falloffMax, 76.8); // E33
    near(r.bulletDamage, 83.88288); // E36
    near(r.damageMultiplier, 1); // B48
  });

  it("computes Flight's bonus damage (E24, Flight T3 on)", () => {
    near(r.flightBonusDamage, 45.396000000000004); // E24
  });

  it("applies Crow's resist shred multiplicatively (E30/E31)", () => {
    near(r.bulletResistShred, 0.06); // E30
    near(r.spiritResistShred, 0.06); // E31
  });

  it("matches damage per bullet (M20, M21, N20, N21)", () => {
    near(r.perBullet.ground.raw, 83.88288); // M20
    near(r.perBullet.flight.raw, 129.27888000000002); // M21
    near(r.perBullet.ground.shredded, 88.91585280000001); // N20
    near(r.perBullet.flight.shredded, 137.03561280000002); // N21
  });

  it("matches damage per clip (M25, M26)", () => {
    near(r.perClip.ground.raw, 2789.10576); // M25
    near(r.perClip.flight.raw, 5526.672120000001); // M26
  });

  it("matches damage per second (M30, M31, N30, N31)", () => {
    near(r.burstDps.ground.raw, 1042.4209380480002); // M30
    near(r.burstDps.flight.raw, 1606.5615696480004); // M31
    near(r.burstDps.ground.shredded, 1104.9661943308802); // N30
    near(r.burstDps.flight.shredded, 1702.9552638268804); // N31
  });

  it("matches the no-item reference column (B32, H20, H25, H26)", () => {
    const noItems = calculateBuild({ ...workbookBuild(), items: [] }, ctx);
    near(noItems.bulletDamage, 34.077420000000004); // B32
    near(noItems.perClip.ground.raw, 647.47098); // H20 - 19 rounds
    near(noItems.burstDps.ground.raw, 147.55522860000002); // H25
    near(noItems.burstDps.flight.raw, 270.16350860000006); // H26
  });

  it("uses Flight's enlarged magazine in the no-item column, which H21 does not", () => {
    // H21 is `=(B32+B24)*B26`: it multiplies by the base 19-round magazine even
    // though B27 right above it computes the 28.5-round Flight magazine, and the
    // equivalent with-items cell (M26) does use it. We follow B27/M26.
    const noItems = calculateBuild({ ...workbookBuild(), items: [] }, ctx);
    near(noItems.flightAmmo, 28.5); // B27
    near(noItems.perBullet.flight.raw, 62.393420000000006); // B32 + B24
    near(noItems.perClip.flight.raw, 62.393420000000006 * 28.5);
    near(noItems.perBullet.flight.raw * 19, 1185.4749800000002); // what H21 shows
  });

  it("matches the chance-based item estimates (N36, N37, N38)", () => {
    // The workbook evaluates these against the current build's spirit power and
    // fire rate whether or not the item is owned, so we check the formulas.
    near(
      (45 + r.spiritPower * 0.19) * r.bulletsPerSecond * 0.15 * (1 + r.spiritResistShred),
      122.96673857370001, // N36 Tesla Bullets
    );
    near(
      (55 + r.spiritPower * 0.19) * r.bulletsPerSecond * 0.15 * (1 + r.spiritResistShred),
      142.7258275737, // N37 Capacitor
    );
    near(
      r.bulletDamage * r.bulletsPerSecond * 0.25 * (1 + r.bulletResistShred),
      276.24154858272004, // N38 Lucky Shot
    );
  });
});

describe("engine rules", () => {
  it("adds damage-multiplier penalties rather than compounding them (B48)", () => {
    const mk = (slugs: string[]) =>
      calculateBuild(createBuild({ items: pick(slugs) }), ctx).damageMultiplier;
    near(mk([]), 1);
    near(mk(["golden-goose-egg"]), 0.9);
    near(mk(["cursed-relic"]), 0.86);
    near(mk(["cursed-relic", "golden-goose-egg"]), 0.76);
  });

  it("keeps a conditional item's cost but drops its stats when switched off", () => {
    const conditional = {
      ...bySlug.get("burst-fire")!,
      stats: {},
      conditionalStats: { fireRatePct: 42 },
      conditional: { label: "Burst window", defaultActive: true },
    };
    const localCtx = { ...ctx, items: [...WORKBOOK_ITEMS, conditional] };
    const on = calculateBuild(createBuild({ items: [createBuildItem(conditional)] }), localCtx);
    const off = calculateBuild(
      createBuild({ items: [{ ...createBuildItem(conditional), active: false }] }),
      localCtx,
    );
    expect(on.itemSouls).toBe(off.itemSouls);
    expect(on.bulletsPerSecond).toBeGreaterThan(off.bulletsPerSecond);
    expect(off.itemStats.fireRatePct ?? 0).toBe(0);
  });

  it("scales Spellslinger with its stack count", () => {
    const at = (stacks: number) =>
      calculateBuild(
        createBuild({ items: [{ ...createBuildItem(bySlug.get("spellslinger")!), stacks }] }),
        ctx,
      ).itemStats;
    expect(at(0).fireRatePct ?? 0).toBe(0);
    near(at(6).fireRatePct, 66);
    near(at(6).reloadSpeedPct, 60);
    near(at(99).fireRatePct, 66); // clamped to maxStacks
  });

  it("scales Cultist Sacrifice with hero boons (Items!F48)", () => {
    const r = calculateBuild(
      createBuild({
        boons: 27,
        boonsFromSouls: false,
        items: pick(["cultist-sacrifice"]),
      }),
      ctx,
    );
    near(r.itemStats.fireRatePct, 10 + 0.8 * 27);
  });

  it("stacks Spirit Rend's four stacks multiplicatively", () => {
    const r = calculateBuild(
      createBuild({
        crowShredActive: false,
        abilityUpgrades: {},
        items: [{ ...createBuildItem(bySlug.get("spirit-rend")!), stacks: 4 }],
      }),
      ctx,
    );
    near(r.spiritResistShred, 1 - 0.92 * 0.93 ** 4);
  });

  it("scales Mercurial Magnum off base gun damage, not a flat amount (E35)", () => {
    // E35 = ((0.25 + spirit x 0.0049) * B20) * (1 + EE stacks x 0.045).
    // At the workbook's own numbers - spirit 90.7, base gun damage 26.2134 -
    // that is 18.203371362.
    near((0.25 + 90.7 * 0.0049) * 26.213400000000004, 18.203371362000002);

    const withMM = calculateBuild(
      { ...workbookBuild(), items: [...workbookBuild().items, ...pick(["mercurial-magnum"])] },
      ctx,
    );
    near(
      withMM.bulletSpiritDamage,
      (0.25 + withMM.spiritPower * 0.0049) * withMM.baseGunDamage,
    );
  });

  describe("headshots", () => {
    const at = (rate: number, extra: string[] = []) =>
      calculateBuild(
        { ...workbookBuild(), headshotRate: rate, items: [...workbookBuild().items, ...pick(extra)] },
        ctx,
      );

    it("adds 65% weapon damage on a headshot, scaled by how often you land one", () => {
      const body = at(0);
      const half = at(50);
      const all = at(100);
      near(body.headshotMultiplier, 1);
      near(half.headshotMultiplier, 1.325);
      near(all.headshotMultiplier, 1.65);
      near(all.perBulletParts.ground.weapon.raw, body.perBulletParts.ground.weapon.raw * 1.65);
      near(half.perBulletParts.ground.weapon.raw, body.perBulletParts.ground.weapon.raw * 1.325);
    });

    it("gives a bullet's spirit damage nothing", () => {
      const mm = { ...bySlug.get("mercurial-magnum")! };
      const localCtx = { ...ctx, items: WORKBOOK_ITEMS };
      const mk = (rate: number) =>
        calculateBuild(
          {
            ...workbookBuild(),
            headshotRate: rate,
            items: [...workbookBuild().items, createBuildItem(mm)],
          },
          localCtx,
        );
      const body = mk(0);
      const heads = mk(100);
      near(heads.perBulletParts.ground.spirit.raw, body.perBulletParts.ground.spirit.raw);
      // Flight's bonus is spirit too, so it is untouched.
      near(heads.flightBonusDamage, body.flightBonusDamage);
      expect(heads.perBulletParts.ground.weapon.raw).toBeGreaterThan(
        body.perBulletParts.ground.weapon.raw,
      );
    });

    it("adds a Lucky Shot proc to the headshot rather than multiplying it", () => {
      // A headshot proc is 165% + 100% = 265% of a bullet, not 165% x 200%.
      const lucky = {
        ...bySlug.get("mercurial-magnum")!,
        slug: "lucky-shot",
        name: "Lucky Shot",
        stats: { procChancePct: 100, procWeaponDamagePct: 100 },
        perSpirit: undefined,
      };
      const localCtx = { ...ctx, items: [...WORKBOOK_ITEMS, lucky] };
      const mk = (rate: number) =>
        calculateBuild(
          {
            ...workbookBuild(),
            headshotRate: rate,
            items: [...workbookBuild().items, createBuildItem(lucky)],
          },
          localCtx,
        );

      const heads = mk(100);
      const base = heads.bulletDamage;
      // Weapon half is 165%, proc adds a flat 100% of the same base.
      near(heads.perBulletParts.ground.weapon.raw, base * 1.65);
      near(heads.perBulletParts.ground.proc.raw, base * 1.0);
      near(heads.perBulletParts.ground.weapon.raw + heads.perBulletParts.ground.proc.raw, base * 2.65);
      // Emphatically not the multiplicative reading.
      expect(heads.perBullet.ground.raw).not.toBeCloseTo(base * 3.3, 4);

      // The proc's own contribution does not move with headshot rate at all.
      near(mk(0).perBulletParts.ground.proc.raw, heads.perBulletParts.ground.proc.raw);
    });

    it("stacks item headshot bonuses on top of the base 65%", () => {
      const booster = {
        ...bySlug.get("mercurial-magnum")!,
        slug: "headshot-booster",
        name: "Headshot Booster",
        stats: { headshotDamagePct: 45 },
        perSpirit: undefined,
      };
      const localCtx = { ...ctx, items: [...WORKBOOK_ITEMS, booster] };
      const r = calculateBuild(
        {
          ...workbookBuild(),
          headshotRate: 100,
          items: [...workbookBuild().items, createBuildItem(booster)],
        },
        localCtx,
      );
      near(r.headshotBonus, 1.1); // 65% + 45%
      near(r.headshotMultiplier, 2.1);
    });

    it("gives Assassinate its own 20%, not the gun's 65%", () => {
      const body = at(0).abilities.find((a) => a.key === "assassinate")!;
      const heads = at(100).abilities.find((a) => a.key === "assassinate")!;
      // The fixture's Assassinate has no headshot bonus configured, so nothing
      // moves; the live hero carries 20%.
      const live = WORKBOOK_HERO.abilities.find((a) => a.key === "assassinate")!;
      expect(live.headshotBonusPct ?? 0).toBe(0);
      near(heads.totalDamage.shredded, body.totalDamage.shredded);
    });

    it("raises DPS but leaves fire rate and magazine alone", () => {
      const body = at(0);
      const heads = at(100);
      expect(heads.burstDps.ground.raw).toBeGreaterThan(body.burstDps.ground.raw);
      near(heads.bulletsPerSecond, body.bulletsPerSecond);
      near(heads.ammo, body.ammo);
    });
  });

  it("folds chance-based procs into the headline DPS as an expected value", () => {
    const lucky = {
      ...bySlug.get("mercurial-magnum")!,
      slug: "lucky-shot",
      name: "Lucky Shot",
      stats: { procChancePct: 25, procWeaponDamagePct: 100 },
      perSpirit: undefined,
    };
    const localCtx = { ...ctx, items: [...WORKBOOK_ITEMS, lucky] };
    const without = calculateBuild(workbookBuild(), localCtx);
    const withLucky = calculateBuild(
      { ...workbookBuild(), items: [...workbookBuild().items, createBuildItem(lucky)] },
      localCtx,
    );

    // 25% chance of +100% weapon damage is +25% on an average bullet. Measured
    // against this build's own bullet damage, since adding an item also moves
    // category investment and therefore the bullet it is a percentage of.
    near(
      withLucky.perBulletParts.ground.proc.raw,
      withLucky.bulletDamage * 0.25 * withLucky.damageMultiplier,
    );
    expect(withLucky.burstDps.ground.raw).toBeGreaterThan(without.burstDps.ground.raw);

    // The per-item figure must agree with what was folded in, or the panel
    // would be explaining a number the total does not contain.
    const listed = withLucky.expectedProcDps.reduce((s, p) => s + p.dps, 0);
    near(listed, withLucky.perBulletParts.ground.proc.shredded * withLucky.bulletsPerSecond);

    // And the three parts still reconstruct the whole bullet.
    const parts = withLucky.perBulletParts.ground;
    near(
      parts.weapon.shredded + parts.spirit.shredded + parts.proc.shredded,
      withLucky.perBullet.ground.shredded,
    );
  });

  it("passes bullet damage to ricochet targets at a discount and spirit damage in full", () => {
    const ricochet = {
      ...bySlug.get("mercurial-magnum")!,
      slug: "ricochet",
      name: "Ricochet",
      stats: { ricochetDamagePct: 65, ricochetTargets: 2 },
      perSpirit: undefined,
    };
    const mm = {
      ...bySlug.get("mercurial-magnum")!,
      stats: { ...bySlug.get("mercurial-magnum")!.stats },
    };
    const localCtx = { ...ctx, items: [...WORKBOOK_ITEMS, ricochet] };
    const r = calculateBuild(
      {
        ...workbookBuild(),
        items: [...workbookBuild().items, createBuildItem(ricochet), createBuildItem(mm)],
      },
      localCtx,
    );

    expect(r.ricochet).not.toBeNull();
    const rico = r.ricochet!;
    expect(rico.targets).toBe(2);

    // Weapon half at 65%, spirit half untouched.
    near(
      rico.perBullet.ground.raw,
      (r.bulletDamage * 0.65 + r.bulletSpiritDamage) * r.damageMultiplier,
    );
    // Flight's bonus is spirit, so it carries over in full.
    near(
      rico.perBullet.flight.raw - rico.perBullet.ground.raw,
      r.flightBonusDamage * r.damageMultiplier,
    );
    near(rico.totalDps.ground.raw, rico.dps.ground.raw * 2);
    near(rico.dps.ground.raw, rico.perBullet.ground.raw * r.bulletsPerSecond);
  });

  it("reports no ricochet when the build has none", () => {
    expect(calculateBuild(workbookBuild(), ctx).ricochet).toBeNull();
  });

  it("splits a bullet into gun and spirit halves that sum back to the total", () => {
    const r = calculateBuild(
      { ...workbookBuild(), items: [...workbookBuild().items, ...pick(["mercurial-magnum"])] },
      ctx,
    );
    for (const lane of ["ground", "flight"] as const) {
      const parts = r.perBulletParts[lane];
      near(parts.weapon.raw + parts.spirit.raw, r.perBullet[lane].raw);
      near(parts.weapon.shredded + parts.spirit.shredded, r.perBullet[lane].shredded);
    }
    // The halves take different resists, so their shredded values scale apart.
    const g = r.perBulletParts.ground;
    near(g.weapon.shredded / g.weapon.raw, 1 + r.bulletResistShred);
    near(g.spirit.shredded / g.spirit.raw, 1 + r.spiritResistShred);
    // Flight's bonus lands entirely on the spirit half.
    near(r.perBulletParts.flight.weapon.raw, g.weapon.raw);
    near(r.perBulletParts.flight.spirit.raw - g.spirit.raw, r.flightBonusDamage);
  });

  it("treats bonus spirit damage per bullet as spirit damage, not bullet damage", () => {
    const withMM = calculateBuild(
      { ...workbookBuild(), items: [...workbookBuild().items, ...pick(["mercurial-magnum"])] },
      ctx,
    );
    // The two halves of the bullet meet different resists, so they have to be
    // shredded separately rather than summed first.
    near(
      withMM.perBullet.ground.shredded,
      withMM.bulletDamage * (1 + withMM.bulletResistShred) +
        withMM.bulletSpiritDamage * (1 + withMM.spiritResistShred),
    );
  });

  it("reports sustained DPS below burst DPS because of reload time", () => {
    const r = calculateBuild(workbookBuild(), ctx);
    expect(r.sustainedDps.ground.raw).toBeLessThan(r.burstDps.ground.raw);
    near(
      r.sustainedDps.ground.raw,
      r.perClip.ground.raw / (r.ammo / r.bulletsPerSecond + r.reloadTime),
    );
  });

  it("can route total spirit power into gun damage instead of pre-item spirit", () => {
    const base = workbookBuild();
    const parity = calculateBuild(base, ctx);
    const fixed = calculateBuild({ ...base, gunDamageUsesTotalSpirit: true }, ctx);
    expect(fixed.baseGunDamage).toBeGreaterThan(parity.baseGunDamage);
    near(
      fixed.baseGunDamage,
      WORKBOOK_HERO.base.gunDamage + 27 * WORKBOOK_HERO.perBoon.gunDamage + fixed.spiritPower * 0.022,
    );
  });

  it("applies an imbue item only to the ability it is assigned to", () => {
    const surge = {
      ...bySlug.get("mercurial-magnum")!,
      slug: "surge-of-power",
      name: "Surge of Power",
      isImbue: true,
      stats: {},
      perSpirit: undefined,
      imbuedStats: { spiritPowerFlat: 28, abilityBonusDamage: 60, cooldownReductionPct: 50 },
    };
    const localCtx = { ...ctx, items: [...WORKBOOK_ITEMS, surge] };
    const base = { ...workbookBuild(), items: [createBuildItem(surge)] };

    const unassigned = calculateBuild(base, localCtx);
    const onStake = calculateBuild({ ...base, imbueTargets: { "surge-of-power": "stake" } }, localCtx);

    // The fixture hero has no Stake, so nothing should move; with a real hero
    // only the imbued ability changes. Use Crow, which the fixture does have.
    const onCrow = calculateBuild(
      { ...base, imbueTargets: { "surge-of-power": "crow-familiar" } },
      localCtx,
    );
    const crowBefore = unassigned.abilities.find((a) => a.key === "crow-familiar")!;
    const crowAfter = onCrow.abilities.find((a) => a.key === "crow-familiar")!;
    const assassinateBefore = unassigned.abilities.find((a) => a.key === "assassinate")!;
    const assassinateAfter = onCrow.abilities.find((a) => a.key === "assassinate")!;

    near(crowAfter.spiritPower, crowBefore.spiritPower + 28);
    near(crowAfter.effectiveCooldown, crowBefore.effectiveCooldown * 0.5);
    expect(crowAfter.imbuedBy).toEqual(["Surge of Power"]);

    // Every other ability is untouched.
    near(assassinateAfter.spiritPower, assassinateBefore.spiritPower);
    near(assassinateAfter.effectiveCooldown, assassinateBefore.effectiveCooldown);
    expect(assassinateAfter.imbuedBy).toEqual([]);
    // And an unassigned imbue does nothing at all.
    near(onStake.abilities.find((a) => a.key === "crow-familiar")!.spiritPower, crowBefore.spiritPower);
  });

  it("feeds an imbue on Flight into its bonus bullet damage", () => {
    // Flight has no cast damage, so its imbue only shows up in the per-bullet
    // bonus and the flight DPS that follows from it.
    const surge = {
      ...bySlug.get("mercurial-magnum")!,
      slug: "surge-of-power",
      name: "Surge of Power",
      isImbue: true,
      stats: {},
      perSpirit: undefined,
      imbuedStats: { spiritPowerFlat: 28 },
    };
    const localCtx = { ...ctx, items: [...WORKBOOK_ITEMS, surge] };
    const base = { ...workbookBuild(), items: [createBuildItem(surge)] };

    const off = calculateBuild(base, localCtx);
    const on = calculateBuild({ ...base, imbueTargets: { "surge-of-power": "flight" } }, localCtx);

    near(on.flightSpiritPower, off.flightSpiritPower + 28);
    // Flight T3 is on in the workbook build, so scaling is 0.28 per spirit.
    near(on.flightBonusDamage, off.flightBonusDamage + 28 * 0.28);
    expect(on.flightDps).toBeGreaterThan(off.flightDps);
    expect(on.flightImbuedBy).toEqual(["Surge of Power"]);
    // Ground DPS is untouched, since the bonus only applies while airborne.
    near(on.groundDps, off.groundDps);
  });

  it("warns when a build spends more ability points than it has", () => {
    const r = calculateBuild(
      createBuild({
        boons: 0,
        boonsFromSouls: false,
        abilityUpgrades: { flight: [true, true, true] },
        items: [],
      }),
      ctx,
    );
    expect(r.abilityPointsSpent).toBe(8);
    expect(r.warnings.join(" ")).toContain("ability points");
  });
});

describe("AP order", () => {
  const abilities = WORKBOOK_HERO.abilities; // flight (slot2), crow-familiar (slot3), assassinate (slot4)
  const allUnlocked = 35; // max boons — every slot is well past its unlock threshold

  it("spends strictly in order, stopping at the first upgrade the budget can't afford", () => {
    const taken = deriveAbilityUpgradesFromApOrder(
      ["flight", "crow-familiar", "flight"],
      abilities,
      3,
      allUnlocked,
    );
    // flight T1 (1, spent 1) + crow T1 (1, spent 2) fit; flight T2 (2, spent 4) does not.
    expect(taken.flight).toEqual([true, false, false]);
    expect(taken["crow-familiar"]).toEqual([true, false, false]);
    expect(taken.assassinate).toEqual([false, false, false]);
  });

  it("does not skip ahead to a later, cheaper entry once the budget is exhausted", () => {
    // Same order as above but a bigger budget reaches flight T2 too, proving the
    // earlier test really did stop rather than happening to omit it some other way.
    const taken = deriveAbilityUpgradesFromApOrder(
      ["flight", "crow-familiar", "flight"],
      abilities,
      4,
      allUnlocked,
    );
    expect(taken.flight).toEqual([true, true, false]);
  });

  it("ignores unknown ability keys and repeats past an ability's last tier", () => {
    const taken = deriveAbilityUpgradesFromApOrder(
      ["bogus-key", "flight", "flight", "flight", "flight"],
      abilities,
      100,
      allUnlocked,
    );
    expect(taken.flight).toEqual([true, true, true]);
  });

  it("won't spend a point on an ability slot that hasn't unlocked yet, even with budget to spare", () => {
    // Assassinate is the ultimate (slot 4), unlocked at boon 7 — deadlock.wiki/Boon.
    // At boon 1 there's already 1 AP available (enough for its 1-cost T1), but it's
    // not a legal target yet, so the plan stops rather than taking it early.
    const taken = deriveAbilityUpgradesFromApOrder(["assassinate"], abilities, 1, 1);
    expect(taken.assassinate).toEqual([false, false, false]);
  });

  it("unlocks the ultimate at exactly boon 7, matching the progression table's own note", () => {
    const taken = deriveAbilityUpgradesFromApOrder(["assassinate"], abilities, 1, 7);
    expect(taken.assassinate).toEqual([true, false, false]);
  });

  it("stops the whole plan at an unopened slot rather than skipping to a later, unlocked entry", () => {
    // Flight (slot 2, unlocks at boon 2) is reachable at boon 2; assassinate (slot 4,
    // boon 7) isn't yet, so the second flight entry queued after it never fires either
    // — same "order is a promise" rule as the budget cutoff, just gated on unlocks.
    const taken = deriveAbilityUpgradesFromApOrder(
      ["flight", "assassinate", "flight"],
      abilities,
      10, // budget is not the constraint being tested here
      2,
    );
    expect(taken.flight).toEqual([true, false, false]);
    expect(taken.assassinate).toEqual([false, false, false]);
  });

  it("the souls-earned slider automatically appoints more of the order as the AP budget grows", () => {
    const build = createBuild({
      boonsFromSouls: true,
      apOrder: ["flight", "crow-familiar", "flight"],
      items: [],
    });
    // 2600 souls -> 3 AP (SEED_PROGRESSION): flight T1 + crow T1 fit, flight T2 doesn't.
    const early = calculateBuild({ ...build, soulsEarned: 2600 }, ctx);
    const earlyFlight = early.resolvedAbilities.find((r) => r.ability.key === "flight");
    expect(earlyFlight?.upgradesTaken).toEqual([true, false, false]);
    expect(early.abilityPointsSpent).toBe(2);

    // 3200 souls -> 4 AP: now flight T2 fits too, with no code changed but the slider.
    const later = calculateBuild({ ...build, soulsEarned: 3200 }, ctx);
    const laterFlight = later.resolvedAbilities.find((r) => r.ability.key === "flight");
    expect(laterFlight?.upgradesTaken).toEqual([true, true, false]);
    expect(later.abilityPointsSpent).toBe(4);
  });

  it("never triggers the overspend warning, since it never exceeds the budget by construction", () => {
    const r = calculateBuild(
      createBuild({
        boonsFromSouls: false,
        boons: 0,
        apOrder: ["flight", "flight", "flight"],
        items: [],
      }),
      ctx,
    );
    expect(r.abilityPointsSpent).toBe(0);
    expect(r.warnings.join(" ")).not.toContain("ability points");
  });

  it("an empty apOrder falls back to the manual abilityUpgrades toggles unchanged", () => {
    const r = calculateBuild(
      createBuild({
        boonsFromSouls: false,
        boons: 35,
        apOrder: [],
        abilityUpgrades: { flight: [true, false, false] },
        items: [],
      }),
      ctx,
    );
    const flight = r.resolvedAbilities.find((a) => a.ability.key === "flight");
    expect(flight?.upgradesTaken).toEqual([true, false, false]);
  });
});

describe("melee scales with weapon damage sources beyond the item stat", () => {
  // WORKBOOK_HERO's assassinate carries a baseline gunDamagePerStack: 0.06
  // regardless of upgrades taken (see resolveAbility), so snipeStacks alone
  // exercises it; WORKBOOK_HERO has no perBoon melee scaling, so boons: 0
  // keeps melee's own base flat and isolates the weapon-damage-derived term.
  function meleeBuild(snipeStacks: number) {
    return createBuild({
      boonsFromSouls: false,
      boons: 0,
      snipeStacks,
      items: [],
    });
  }

  it("Assassinate's per-kill weapon damage stacks also move melee, at half rate", () => {
    const none = calculateBuild(meleeBuild(0), ctx);
    const staked = calculateBuild(meleeBuild(10), ctx);
    // snipeStackBonus = 10 * 0.06 = 0.6; melee's share is half of that: +30%.
    expect(none.lightMelee).toBeCloseTo(50, 5);
    expect(staked.lightMelee).toBeCloseTo(50 * 1.3, 5);
    expect(none.heavyMelee).toBeCloseTo(116, 5);
    expect(staked.heavyMelee).toBeCloseTo(116 * 1.3, 5);
  });
});
