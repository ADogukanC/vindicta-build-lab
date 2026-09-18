/**
 * Plated Armor is the *target's* own item, not something Vindicta buys, so
 * it can't be exercised through the frozen `engine.test.ts` workbook fixture
 * the way every other item is (that fixture never included it - see its own
 * header comment on why it must stay frozen). These run against the live
 * seed catalogue instead, the same way `metrics.test.ts` does, and read
 * Plated Armor's and Armor Piercing Rounds' own numbers off the catalogue
 * rather than hard-coding them, so a future patch to either item doesn't
 * quietly go untested.
 */
import { describe, expect, it } from "vitest";
import { SEED_HERO, SEED_ITEMS, SEED_PROGRESSION } from "../data/seed";
import { createBuild, createBuildItem } from "../build";
import { calculateBuild } from "./engine";

const ctx = { hero: SEED_HERO, items: SEED_ITEMS, progression: SEED_PROGRESSION };
const bySlug = new Map(SEED_ITEMS.map((i) => [i.slug, i]));
const platedArmor = bySlug.get("plated-armor")!;
const armorPiercingRounds = bySlug.get("armor-piercing-rounds")!;
const mercurialMagnum = bySlug.get("mercurial-magnum")!;

const infoValue = (key: string): number => {
  for (const block of platedArmor.info ?? []) {
    const row = block.rows.find((r) => r.key === key);
    if (row && typeof row.value === "number") return row.value;
  }
  throw new Error(`Plated Armor has no info row ${key}`);
};
const deflectChance = infoValue("DeflectionPercent") / 100;
const onHitDeflectChance = infoValue("BulletProcDeflectionPercent") / 100;
const aprChance = (armorPiercingRounds.stats.procChancePct ?? 0) / 100;
const weakeningHeadshot = bySlug.get("weakening-headshot")!; // 12% bullet shred, unconditional
const hollowPoint = bySlug.get("hollow-point")!; // 10% bullet shred, conditional

describe("enemyHasPlatedArmor", () => {
  it("leaves DPS untouched by default", () => {
    const off = createBuild({ items: [], soulsEarned: 0 });
    const result = calculateBuild(off, ctx);
    expect(off.enemyHasPlatedArmor).toBe(false);
    expect(result.burstDps.ground.shredded).toBeGreaterThan(0);
  });

  it("cuts weapon damage by the deflection chance with no other items", () => {
    // No items at all: burst ground DPS is pure weapon damage, no spirit
    // riding on the bullet and no procs, so the ratio isolates exactly the
    // weapon-deflection multiplier. Crow Familiar's own passive shred is
    // disabled so the baseline resist multiplier is a clean 1, not 1+shred.
    const withoutArmor = calculateBuild(
      createBuild({ items: [], soulsEarned: 0, enemyHasPlatedArmor: false, crowShredActive: false }),
      ctx,
    );
    const withArmor = calculateBuild(
      createBuild({ items: [], soulsEarned: 0, enemyHasPlatedArmor: true, crowShredActive: false }),
      ctx,
    );
    const ratio = withArmor.burstDps.ground.shredded / withoutArmor.burstDps.ground.shredded;
    expect(ratio).toBeCloseTo(1 - deflectChance, 5);
  });

  it("lets Armor Piercing Rounds recover part of the deflected weapon damage", () => {
    const entry = createBuildItem(armorPiercingRounds);
    const withoutArmor = calculateBuild(
      createBuild({
        items: [entry],
        soulsEarned: armorPiercingRounds.cost,
        enemyHasPlatedArmor: false,
        crowShredActive: false,
      }),
      ctx,
    );
    const withArmor = calculateBuild(
      createBuild({
        items: [entry],
        soulsEarned: armorPiercingRounds.cost,
        enemyHasPlatedArmor: true,
        crowShredActive: false,
      }),
      ctx,
    );
    const ratio = withArmor.burstDps.ground.shredded / withoutArmor.burstDps.ground.shredded;
    // Per-bullet: pierced (chance aprChance, full damage), or not pierced
    // (chance 1-aprChance, deflected at the normal rate).
    const expectedRatio = aprChance + (1 - aprChance) * (1 - deflectChance);
    expect(ratio).toBeCloseTo(expectedRatio, 5);
    // The pierce chance must actually be recovering something, or the two
    // "with Plated Armor" cases (with/without Armor Piercing Rounds) would
    // be indistinguishable and this test wouldn't be testing anything.
    expect(expectedRatio).toBeGreaterThan(1 - deflectChance);
  });

  it("blocks on-hit spirit damage riding on the bullet, unless Armor Piercing Rounds pierces it", () => {
    // Mercurial Magnum's bullets carry bonus spirit damage while its buff
    // window is active - force that on rather than relying on the item's
    // own (off) default, same as the value-per-soul tools do.
    const magnumEntry = { ...createBuildItem(mercurialMagnum), active: true };

    const withoutApr = [magnumEntry];
    const withoutAprSouls = withoutApr.reduce((s, i) => s + (bySlug.get(i.slug)?.cost ?? 0), 0);
    const withoutApr_noArmor = calculateBuild(
      createBuild({ items: withoutApr, soulsEarned: withoutAprSouls, enemyHasPlatedArmor: false }),
      ctx,
    );
    const withoutApr_withArmor = calculateBuild(
      createBuild({ items: withoutApr, soulsEarned: withoutAprSouls, enemyHasPlatedArmor: true }),
      ctx,
    );
    expect(withoutApr_noArmor.perBulletParts.ground.spirit.shredded).toBeGreaterThan(0);
    const ratioNoApr =
      withoutApr_withArmor.perBulletParts.ground.spirit.shredded /
      withoutApr_noArmor.perBulletParts.ground.spirit.shredded;
    expect(ratioNoApr).toBeCloseTo(1 - onHitDeflectChance, 5);

    // deadlock.wiki, Armor Piercing Rounds patch history, Dec 16 2025: "When
    // Armor Piercing Rounds Proc's, Plated Armor can no longer stop the
    // Proc'd Bullet" - a pierce bypasses Plated Armor's on-hit block too,
    // not just the weapon-damage deflection, so the block chance that
    // actually lands is only (1 - aprChance) * onHitDeflectChance.
    const withApr = [magnumEntry, createBuildItem(armorPiercingRounds)];
    const withAprSouls = withApr.reduce((s, i) => s + (bySlug.get(i.slug)?.cost ?? 0), 0);
    const withApr_noArmor = calculateBuild(
      createBuild({ items: withApr, soulsEarned: withAprSouls, enemyHasPlatedArmor: false }),
      ctx,
    );
    const withApr_withArmor = calculateBuild(
      createBuild({ items: withApr, soulsEarned: withAprSouls, enemyHasPlatedArmor: true }),
      ctx,
    );
    const ratioWithApr =
      withApr_withArmor.perBulletParts.ground.spirit.shredded /
      withApr_noArmor.perBulletParts.ground.spirit.shredded;
    expect(ratioWithApr).toBeCloseTo(1 - (1 - aprChance) * onHitDeflectChance, 5);
    // Armor Piercing Rounds must actually be recovering something here, or
    // this test isn't distinguishing the two cases at all.
    expect(ratioWithApr).toBeGreaterThan(ratioNoApr);
  });

  it("zeroes the target's own resist on a pierce, then applies your own shred additively on top", () => {
    // Two bullet-shred sources (12% and 10%) so additive (22%) and
    // diminishing (1 - 0.88*0.90 = 20.8%) actually disagree - a single-source
    // build can't tell the two models apart.
    const items = [
      // Both items default their shred to off (a shred that requires landing
      // a headshot, or a cooldown-gated debuff, isn't assumed to be up) -
      // force it on for both, and Hollow Point's own conditional gate too.
      { ...createBuildItem(weakeningHeadshot), shredActive: true },
      { ...createBuildItem(hollowPoint), active: true, shredActive: true },
    ];
    const soulsEarned = items.reduce((s, i) => s + (bySlug.get(i.slug)?.cost ?? 0), 0);
    const enemyBulletResistPct = 40;
    const additiveShred = 0.12 + 0.1;
    const diminishingShred = 1 - (1 - 0.12) * (1 - 0.1);

    const withoutApr = calculateBuild(
      createBuild({ items, soulsEarned, enemyBulletResistPct, crowShredActive: false }),
      ctx,
    );
    expect(withoutApr.bulletResistShred).toBeCloseTo(diminishingShred, 6);

    const withApr = calculateBuild(
      createBuild({
        items: [...items, createBuildItem(armorPiercingRounds)],
        soulsEarned: soulsEarned + armorPiercingRounds.cost,
        enemyBulletResistPct,
        crowShredActive: false,
      }),
      ctx,
    );
    const normalMul = 1 - enemyBulletResistPct / 100 + diminishingShred;
    // Not "ignore resist, keep the normal (diminishing) shred" - that would
    // still read `1 - 0 + diminishingShred`. Specifically: target resist
    // zeroed, your shred re-combined *additively* on top.
    const piercedMul = 1 + additiveShred;
    const expectedMul = aprChance * piercedMul + (1 - aprChance) * normalMul;
    expect(withApr.perBulletParts.ground.weapon.shredded).toBeCloseTo(
      withApr.bulletDamage * expectedMul,
      4,
    );
  });

  it("lets an Armor Piercing Rounds proc bypass both of Plated Armor's effects on the same bullet", () => {
    const magnumEntry = { ...createBuildItem(mercurialMagnum), active: true };
    const items = [magnumEntry, createBuildItem(armorPiercingRounds)];
    const soulsEarned = items.reduce((s, i) => s + (bySlug.get(i.slug)?.cost ?? 0), 0);
    const withArmor = calculateBuild(
      createBuild({ items, soulsEarned, enemyHasPlatedArmor: true, crowShredActive: false }),
      ctx,
    );
    const noArmor = calculateBuild(
      createBuild({ items, soulsEarned, enemyHasPlatedArmor: false, crowShredActive: false }),
      ctx,
    );
    // Weapon damage: a pierce ignores the deflection chance entirely, so the
    // multiplier only ever drops by the *non-pierced* share.
    const weaponRatio =
      withArmor.perBulletParts.ground.weapon.shredded / noArmor.perBulletParts.ground.weapon.shredded;
    expect(weaponRatio).toBeCloseTo(1 - (1 - aprChance) * deflectChance, 5);
    // On-hit spirit damage: same shape, using the on-hit block chance instead.
    const spiritRatio =
      withArmor.perBulletParts.ground.spirit.shredded / noArmor.perBulletParts.ground.spirit.shredded;
    expect(spiritRatio).toBeCloseTo(1 - (1 - aprChance) * onHitDeflectChance, 5);
  });

  it("only ever touches gun/bullet resist - spirit resist and ability damage are untouched", () => {
    const magnumEntry = { ...createBuildItem(mercurialMagnum), active: true };
    const items = [magnumEntry, createBuildItem(armorPiercingRounds)];
    const soulsEarned = items.reduce((s, i) => s + (bySlug.get(i.slug)?.cost ?? 0), 0);
    // A high Enemy Spirit Resist, held constant, while Plated Armor - the
    // only other lever that touches the spirit half here - is toggled: the
    // spirit-side numbers must stay identical throughout.
    const a = calculateBuild(
      createBuild({ items, soulsEarned, enemySpiritResistPct: 50, enemyHasPlatedArmor: false }),
      ctx,
    );
    const b = calculateBuild(
      createBuild({ items, soulsEarned, enemySpiritResistPct: 50, enemyHasPlatedArmor: true }),
      ctx,
    );
    // The weapon (gun-resist) side does change with Plated Armor...
    expect(b.perBulletParts.ground.weapon.shredded).not.toBeCloseTo(
      a.perBulletParts.ground.weapon.shredded,
      3,
    );
    // ...but Assassinate (pure spirit, fired from the gun but never
    // weapon-typed) is completely unaffected by anything Armor Piercing
    // Rounds or Plated Armor's weapon-side math does.
    const assassinateA = a.abilities.find((ab) => ab.key === "assassinate")!;
    const assassinateB = b.abilities.find((ab) => ab.key === "assassinate")!;
    expect(assassinateB.totalDamage.shredded).toBeCloseTo(assassinateA.totalDamage.shredded, 6);
    expect(assassinateB.spiritPower).toBeCloseTo(assassinateA.spiritPower, 6);
  });

  it("independently rolls weapon deflection and on-hit-effect block - one can land without the other", () => {
    // If a bullet's weapon damage and its on-hit effect were the same coin
    // flip, the weapon-side ratio and the on-hit-side ratio would always
    // move together. They don't: Plated Armor's own numbers differ (30% vs
    // 50% by default), so the two ratios below are provably distinct -
    // meaning a bullet can land its base damage while its on-hit effect is
    // blocked (or vice versa), exactly the "gun damage only, no on-hit
    // effect" case reported from real play.
    const magnumEntry = { ...createBuildItem(mercurialMagnum), active: true };
    const items = [magnumEntry];
    const soulsEarned = items.reduce((s, i) => s + (bySlug.get(i.slug)?.cost ?? 0), 0);
    const noArmor = calculateBuild(createBuild({ items, soulsEarned, enemyHasPlatedArmor: false }), ctx);
    const withArmor = calculateBuild(createBuild({ items, soulsEarned, enemyHasPlatedArmor: true }), ctx);
    const weaponRatio =
      withArmor.perBulletParts.ground.weapon.shredded / noArmor.perBulletParts.ground.weapon.shredded;
    const spiritRatio =
      withArmor.perBulletParts.ground.spirit.shredded / noArmor.perBulletParts.ground.spirit.shredded;
    expect(weaponRatio).toBeCloseTo(1 - deflectChance, 5);
    expect(spiritRatio).toBeCloseTo(1 - onHitDeflectChance, 5);
    expect(weaponRatio).not.toBeCloseTo(spiritRatio, 3);
  });
});
