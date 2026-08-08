/**
 * Guards on the live catalogue imported from deadlock.wiki.
 *
 * These are cheap invariants that catch a bad re-import: an unmapped stat key
 * silently doing nothing, a component pointing at an item that no longer
 * exists, a shop entry with no icon.
 */
import { describe, expect, it } from "vitest";
import { SEED_HERO, SEED_ITEMS, SEED_PROGRESSION } from "./seed";
import { STAT_BY_KEY } from "../stats";
import {
  addItemToBuild,
  componentClosure,
  createBuild,
  createBuildItem,
  setUpgradeTier,
} from "../build";
import { calculateBuild } from "../calc/engine";

const bySlug = new Map(SEED_ITEMS.map((i) => [i.slug, i]));
const live = SEED_ITEMS.filter((i) => i.enabled);

describe("item catalogue", () => {
  it("carries only live items", () => {
    // Disabled and unreleased entries are dropped at import; nothing in the
    // catalogue should be dead weight.
    expect(SEED_ITEMS.length).toBeGreaterThan(160);
    expect(live.length).toBe(SEED_ITEMS.length);
    expect(SEED_ITEMS.filter((i) => !i.enabled)).toEqual([]);
    expect(SEED_ITEMS.some((i) => i.name.includes("Disabled"))).toBe(false);
  });

  it("gives every shop-visible item an icon", () => {
    const missing = live.filter((i) => !i.iconUrl).map((i) => i.name);
    expect(missing).toEqual([]);
  });

  it("uses only stat keys the registry knows about", () => {
    const unknown = new Set<string>();
    for (const item of SEED_ITEMS) {
      for (const bag of [item.stats, item.conditionalStats, item.perStack, item.perBoon]) {
        for (const key of Object.keys(bag ?? {})) {
          if (!STAT_BY_KEY[key]) unknown.add(`${item.slug}: ${key}`);
        }
      }
    }
    expect([...unknown]).toEqual([]);
  });

  it("gives every item a unique slug", () => {
    // Two items ship as "Silencer"; the importer disambiguates on the game key.
    const counts = new Map<string, number>();
    for (const item of SEED_ITEMS) {
      counts.set(item.slug, (counts.get(item.slug) ?? 0) + 1);
    }
    expect([...counts.entries()].filter(([, n]) => n > 1)).toEqual([]);
  });

  it("does not count ability-scoped or enemy-facing spirit as hero spirit power", () => {
    // Surge of Power and Frostbite Charm grant spirit to the *imbued ability*.
    for (const slug of ["surge-of-power", "frostbite-charm"]) {
      const item = bySlug.get(slug);
      if (!item) continue;
      expect(item.stats.spiritPowerFlat ?? 0).toBe(0);
      expect(item.conditionalStats?.spiritPowerFlat ?? 0).toBe(0);
    }
    // Spirit Sap and Focus Lens strip spirit from the enemy, not from you.
    for (const slug of ["spirit-sap", "focus-lens"]) {
      const item = bySlug.get(slug);
      if (!item) continue;
      expect(item.stats.spiritPowerFlat ?? 0).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps the spirit power the workbook independently derived", () => {
    // Spiritual Overflow: 6 innate + 40 while charged = the workbook's 46.
    const overflow = bySlug.get("spiritual-overflow")!;
    expect(overflow.stats.spiritPowerFlat).toBe(6);
    expect(overflow.conditionalStats?.spiritPowerFlat).toBe(40);
    expect(bySlug.get("improved-spirit")!.stats.spiritPowerFlat).toBe(18);
    expect(bySlug.get("boundless-spirit")!.stats.spiritPowerFlat).toBe(30);
    expect(bySlug.get("boundless-spirit")!.stats.spiritPowerPct).toBe(15);
  });

  it("gates a bonus you have to trigger, and holds one you simply have", () => {
    // A conditional is off by default when its block has its own cooldown, a
    // finite duration, or belongs to an item you have to press. Otherwise it is
    // a state you hold and starts on.
    const on = (slug: string) => bySlug.get(slug)!.conditional?.defaultActive;

    // Range and target-state gates: hold them by standing in the right place.
    expect(on("sharpshooter")).toBe(true);
    expect(on("long-range")).toBe(true);
    expect(on("close-quarters")).toBe(true);
    expect(on("monster-rounds")).toBe(true);
    expect(on("enchanters-emblem")).toBe(true);

    // Timed windows and things you press: off until you say so.
    expect(on("burst-fire")).toBe(false); // 4.5s window, 9s cooldown
    expect(on("active-reload")).toBe(false); // 7s window, 12s cooldown
    expect(on("kinetic-dash")).toBe(false); // 7s, needs a dash-jump
    expect(on("spiritual-overflow")).toBe(false); // 15s, has to be charged up
    expect(on("counterspell")).toBe(false); // 6s buff, 23s cooldown
    expect(on("fleetfoot")).toBe(false); // an active you press
    expect(on("vampiric-burst")).toBe(false); // an active you press

    // Shred behind a cooldown is a window too.
    expect(bySlug.get("alchemical-fire")!.defaultShredActive).toBe(false);
  });

  it("never assumes stacks are already held", () => {
    // Stacks always have to be earned, so every stacking item carries a gate.
    for (const item of SEED_ITEMS) {
      if (!item.maxStacks) continue;
      expect(item.conditional, `${item.name} has stacks but no gate`).toBeDefined();
    }
    // Escalating Resilience is the worst case: 30 stacks of bullet resist.
    const resilience = bySlug.get("escalating-resilience")!;
    expect(resilience.perStack?.bulletResistPct).toBe(2);
    expect(resilience.maxStacks).toBe(30);
    expect(resilience.conditional?.defaultActive).toBe(false);
  });

  it("keeps trigger-gated stats rather than dropping them", () => {
    // These arrive under non-obvious keys and were being silently lost.
    expect(bySlug.get("burst-fire")!.conditionalStats?.fireRatePct).toBe(32);
    expect(bySlug.get("intensifying-magazine")!.conditionalStats?.weaponDamagePct).toBe(45);
    expect(bySlug.get("frenzy")!.conditionalStats?.fireRatePct).toBe(40);
    expect(bySlug.get("shadow-weave")!.conditionalStats?.spiritPowerFlat).toBe(25);
    expect(bySlug.get("glass-cannon")!.perStack?.fireRatePct).toBe(7);
  });

  it("uses real stack caps rather than assumed ones", () => {
    // Glass Cannon's per-kill stacks have no cap in the export; 8 is confirmed.
    expect(bySlug.get("glass-cannon")!.maxStacks).toBe(8);
    const assumed = SEED_ITEMS.filter((i) => (i.notes ?? "").includes("no stack cap"));
    expect(assumed.map((i) => i.name)).toEqual([]);
  });

  it("labels an active item's conditional after its active effect", () => {
    // Anything you have to press only pays out while the effect is running, so
    // none of them should fall back to the vague generic label.
    const vague = SEED_ITEMS.filter(
      (i) => i.activation !== "Passive" && i.conditional?.label === "Condition met",
    ).map((i) => i.name);
    expect(vague).toEqual([]);
    expect(bySlug.get("vampiric-burst")!.conditional?.label).toBe("Active effect running");
  });

  it("scales Mercurial Magnum's bonus off base gun damage", () => {
    const mm = bySlug.get("mercurial-magnum")!;
    expect(mm.stats.bulletSpiritDamagePctOfBase).toBe(25);
    expect(mm.perSpirit?.bulletSpiritDamagePctOfBase).toBe(0.49);
    expect(mm.stats.bulletSpiritDamageFlat ?? 0).toBe(0);
  });

  it("scopes imbue items' ability stats to the imbued ability", () => {
    // These modify one ability, so they must never land in the global bag.
    expect(bySlug.get("surge-of-power")!.imbuedStats?.spiritPowerFlat).toBe(28);
    expect(bySlug.get("surge-of-power")!.stats.spiritPowerFlat ?? 0).toBe(0);
    expect(bySlug.get("compress-cooldown")!.imbuedStats?.cooldownReductionPct).toBe(18);
    expect(bySlug.get("compress-cooldown")!.stats.cooldownReductionPct ?? 0).toBe(0);
    expect(bySlug.get("frostbite-charm")!.imbuedStats?.spiritPowerFlat).toBe(70);

    // Quicksilver Reload and Mercurial Magnum charge up the imbued ability.
    expect(bySlug.get("quicksilver-reload")!.imbuedStats?.abilityBonusDamage).toBe(44);
    expect(bySlug.get("mercurial-magnum")!.imbuedStats?.abilityBonusDamage).toBe(60);

    // Their innate halves stay global: Mercurial Magnum's +7 spirit and the
    // weapon buffs apply whatever you imbue.
    expect(bySlug.get("mercurial-magnum")!.stats.spiritPowerFlat).toBe(7);
    expect(bySlug.get("quicksilver-reload")!.stats.fireRatePct).toBe(10);
  });

  it("only references components that exist", () => {
    const dangling: string[] = [];
    for (const item of SEED_ITEMS) {
      for (const component of item.components ?? []) {
        if (!bySlug.has(component)) dangling.push(`${item.slug} -> ${component}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it("has no component cycles", () => {
    for (const item of SEED_ITEMS) {
      expect(componentClosure(item, SEED_ITEMS).has(item.slug)).toBe(false);
    }
  });

  it("carries every category and tier", () => {
    expect(new Set(live.map((i) => i.category))).toEqual(
      new Set(["Weapon", "Vitality", "Spirit"]),
    );
    expect(new Set(live.map((i) => i.tier))).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it("keeps the stats the workbook independently derived", () => {
    // Sharpshooter: 10% flat + 60% beyond min range = the workbook's 70%.
    const sharpshooter = bySlug.get("sharpshooter")!;
    expect(sharpshooter.stats.weaponDamagePct).toBe(10);
    expect(sharpshooter.conditionalStats?.weaponDamagePct).toBe(60);
    expect(sharpshooter.stats.bulletVelocityPct).toBe(60);
    expect(sharpshooter.stats.falloffRangePct).toBe(20);

    // Spellslinger: 11% fire rate and 10% reload speed per stack, 6 stacks.
    const spellslinger = bySlug.get("spellslinger")!;
    expect(spellslinger.perStack?.fireRatePct).toBe(11);
    expect(spellslinger.perStack?.reloadSpeedPct).toBe(10);
    expect(spellslinger.maxStacks).toBe(6);

    // Spirit Rend: 8% base shred plus 7% per stack, up to 4.
    const rend = bySlug.get("spirit-rend")!;
    expect(rend.shred?.spirit).toBe(0.08);
    expect(rend.shred?.perStackSpirit).toBe(0.07);
    expect(rend.maxStacks).toBe(4);

    // Escalating Exposure: 4.5% spirit amp per stack.
    expect(bySlug.get("escalating-exposure")!.perStack?.spiritAmpPct).toBe(4.5);

    // Golden Goose Egg still costs you 10% of your outgoing damage.
    expect(bySlug.get("golden-goose-egg")!.damageMultiplier).toBe(0.9);
  });

  it("stores resist shred as a positive fraction", () => {
    for (const item of SEED_ITEMS) {
      for (const value of Object.values(item.shred ?? {})) {
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThan(1);
      }
    }
  });

  it("stores reload speed so that a positive value is faster", () => {
    // The game inverts this one; the importer flips it back.
    expect(bySlug.get("spellslinger")!.perStack?.reloadSpeedPct).toBeGreaterThan(0);
  });
});

describe("component consumption", () => {
  const ctx = { hero: SEED_HERO, items: SEED_ITEMS, progression: SEED_PROGRESSION };

  it("absorbs a component when its upgrade is reached on the timeline", () => {
    const longRange = bySlug.get("long-range")!;
    const sharpshooter = bySlug.get("sharpshooter")!;

    // Both stay in the plan: you really do buy Long Range first and upgrade.
    let build = createBuild({ soulsEarned: 0 });
    build = addItemToBuild(build, longRange);
    build = addItemToBuild(build, sharpshooter);
    expect(build.items.map((i) => i.slug)).toEqual(["long-range", "sharpshooter"]);

    const early = calculateBuild({ ...build, soulsEarned: longRange.cost }, ctx);
    expect([...early.timeline.heldSlugs]).toEqual(["long-range"]);

    // The upgrade costs only the difference, and swallows the component.
    const late = calculateBuild({ ...build, soulsEarned: sharpshooter.cost }, ctx);
    expect([...late.timeline.heldSlugs]).toEqual(["sharpshooter"]);
    expect(late.itemSouls).toBe(sharpshooter.cost);
    expect(late.timeline.soulsSpent).toBe(sharpshooter.cost);
  });
});

describe("hero configuration", () => {
  it("has the four abilities in the right slots", () => {
    const order = SEED_HERO.abilities
      .slice()
      .sort((a, b) => a.slot - b.slot)
      .map((a) => a.name);
    expect(order).toEqual(["Stake", "Flight", "Crow Familiar", "Assassinate"]);
  });

  it("gives every ability three upgrades costing 1, 2 and 5 ability points", () => {
    for (const ability of SEED_HERO.abilities) {
      expect(ability.upgrades?.map((u) => u.cost)).toEqual([1, 2, 5]);
    }
  });

  it("keeps the shred and stack values the workbook confirmed", () => {
    const crow = SEED_HERO.abilities.find((a) => a.key === "crow-familiar")!;
    expect(crow.effects?.bulletResistShred).toBe(0.06);
    expect(crow.upgrades?.[2].effects?.bulletResistShred).toBe(0.14);

    const assassinate = SEED_HERO.abilities.find((a) => a.key === "assassinate")!;
    expect(assassinate.effects?.gunDamagePerStack).toBe(0.06);
    expect(assassinate.upgrades?.[2].effects?.gunDamagePerStack).toBe(0.1);

    const flight = SEED_HERO.abilities.find((a) => a.key === "flight")!;
    expect(flight.effects?.flightBaseDamage).toBe(10);
    expect(flight.effects?.flightSpiritScaling).toBe(0.18);
    expect(flight.upgrades?.[2].effects?.flightSpiritScaling).toBe(0.28);
  });

  it("separates the weapon headshot bonus from Assassinate's own", () => {
    // A gun headshot is +65%; Assassinate's scoped shot has its own +20%.
    expect(SEED_HERO.headshotBonusPct).toBe(65);
    const assassinate = SEED_HERO.abilities.find((a) => a.key === "assassinate")!;
    expect(assassinate.headshotBonusPct).toBe(20);
    // No other ability gets a headshot bonus.
    for (const ability of SEED_HERO.abilities) {
      if (ability.key !== "assassinate") expect(ability.headshotBonusPct ?? 0).toBe(0);
    }
  });

  it("has no placeholder abilities left", () => {
    expect(SEED_HERO.abilities.filter((a) => a.needsVerification)).toEqual([]);
  });

  it("scales all of Assassinate's damage with Escalating Exposure's spirit amp — base and bonus alike", () => {
    // Assassinate is purely spirit damage: base shot, execute bonus and the
    // headshot multiplier all sit on the same spirit-scaled total, so nothing
    // about it should be exempt from a spirit amp stack.
    const ctx = { hero: SEED_HERO, items: SEED_ITEMS, progression: SEED_PROGRESSION };
    const escalatingExposure = bySlug.get("escalating-exposure")!;

    let build = createBuild({ boons: 27, boonsFromSouls: false });
    build = addItemToBuild(build, escalatingExposure);
    build = {
      ...build,
      items: build.items.map((i) =>
        i.slug === "escalating-exposure" ? { ...i, active: true, stacks: 0 } : i,
      ),
    };

    const noStacks = calculateBuild(build, ctx);
    const assassinateNoStacks = noStacks.damageProfiles.find((p) => p.key === "assassinate")!;

    const withStacks = calculateBuild(
      {
        ...build,
        items: build.items.map((i) =>
          i.slug === "escalating-exposure" ? { ...i, active: true, stacks: 12 } : i,
        ),
      },
      ctx,
    );
    const assassinateWithStacks = withStacks.damageProfiles.find((p) => p.key === "assassinate")!;

    expect(noStacks.spiritAmp).toBe(0);
    expect(withStacks.spiritAmp).toBeCloseTo(0.54, 6); // 12 stacks x 4.5%
    expect(assassinateWithStacks.bonus.shredded).toBeGreaterThan(assassinateNoStacks.bonus.shredded);
    expect(assassinateWithStacks.base.shredded).toBeGreaterThan(assassinateNoStacks.base.shredded);
    // Amp lifts base and bonus by the exact same factor, so it survives on the
    // combined, headshot total too.
    const factor = 1 + withStacks.spiritAmp;
    expect(assassinateWithStacks.base.shredded / assassinateNoStacks.base.shredded).toBeCloseTo(
      factor,
      6,
    );
    expect(
      assassinateWithStacks.maxHeadshot.shredded / assassinateNoStacks.maxHeadshot.shredded,
    ).toBeCloseTo(factor, 6);
  });

  it("applies Enemy Resist per deadlock.wiki/Damage_Resistance: damage x (1 - (resist - shred))", () => {
    // Crow Familiar's own passive shred (always on) gives a known, non-zero
    // bulletResistShred to test against, independent of any items.
    const ctx = { hero: SEED_HERO, items: SEED_ITEMS, progression: SEED_PROGRESSION };
    const enemyBulletResistPct = 52;
    const bare = calculateBuild(createBuild({ boons: 27 }), ctx);
    const resisted = calculateBuild(createBuild({ boons: 27, enemyBulletResistPct }), ctx);

    // Shred itself (how much you strip) doesn't depend on the enemy's resist.
    expect(resisted.bulletResistShred).toBeGreaterThan(0);
    expect(resisted.bulletResistShred).toBeCloseTo(bare.bulletResistShred, 6);

    const expectedMul = 1 - enemyBulletResistPct / 100 + resisted.bulletResistShred;
    expect(resisted.perBulletParts.ground.weapon.shredded).toBeCloseTo(
      resisted.bulletDamage * expectedMul,
      6,
    );
    // At 0% Enemy Resist (the default), this reproduces the app's original
    // shred-as-pure-amp behaviour exactly.
    expect(bare.perBulletParts.ground.weapon.shredded).toBeCloseTo(
      bare.bulletDamage * (1 + bare.bulletResistShred),
      6,
    );
    // Raising the slider should always cost DPS, never gain it.
    expect(resisted.groundDps).toBeLessThan(bare.groundDps);
  });

  it("tracks Enemy Resist separately for bullet and spirit, since a target can be built to resist one and not the other", () => {
    // Stake is spirit damage, so it only reads enemySpiritResistPct. A high
    // bullet resist alone must not touch it, and vice versa for a weapon
    // number like the gun's own bullet damage.
    const ctx = { hero: SEED_HERO, items: SEED_ITEMS, progression: SEED_PROGRESSION };
    const bare = calculateBuild(createBuild({ boons: 27 }), ctx);
    const bulletOnly = calculateBuild(
      createBuild({ boons: 27, enemyBulletResistPct: 80 }),
      ctx,
    );
    const spiritOnly = calculateBuild(
      createBuild({ boons: 27, enemySpiritResistPct: 80 }),
      ctx,
    );

    const stakeBare = bare.abilities.find((a) => a.key === "stake")!;
    const stakeBulletOnly = bulletOnly.abilities.find((a) => a.key === "stake")!;
    const stakeSpiritOnly = spiritOnly.abilities.find((a) => a.key === "stake")!;

    // 80% bullet resist doesn't touch Stake's (spirit) damage at all...
    expect(stakeBulletOnly.totalDamage.shredded).toBeCloseTo(stakeBare.totalDamage.shredded, 6);
    // ...but 80% spirit resist does.
    expect(stakeSpiritOnly.totalDamage.shredded).toBeLessThan(stakeBare.totalDamage.shredded);

    // Symmetrically, 80% spirit resist doesn't touch the regular gun's bullet
    // damage, but 80% bullet resist does.
    expect(spiritOnly.bulletDamage).toBeCloseTo(bare.bulletDamage, 6);
    expect(spiritOnly.perBulletParts.ground.weapon.shredded).toBeCloseTo(
      bare.perBulletParts.ground.weapon.shredded,
      6,
    );
    expect(bulletOnly.perBulletParts.ground.weapon.shredded).toBeLessThan(
      bare.perBulletParts.ground.weapon.shredded,
    );
  });

  it("never lets Enemy Resist push damage negative, even maxed out with no shred", () => {
    const ctx = { hero: SEED_HERO, items: SEED_ITEMS, progression: SEED_PROGRESSION };
    const r = calculateBuild(createBuild({ boons: 27, enemyBulletResistPct: 100 }), ctx);
    // Only Crow's always-on passive shred (6%) counters the full 100% resist
    // on a bare build, so ground DPS should land near that residual, not at
    // zero and never negative.
    const expectedMul = 1 - 1 + r.bulletResistShred;
    expect(r.groundDps).toBeCloseTo(r.bulletDamage * r.bulletsPerSecond * expectedMul, 6);
    expect(r.groundDps).toBeGreaterThan(0);
  });

  it("applies item cooldown reduction after ability-tier cooldown deltas, not before", () => {
    // Stake: 40s base, -22s at T2 = 18s. A 50% item CDR must multiply that 18s
    // (-> 9s), not the original 40s.
    const ctx = { hero: SEED_HERO, items: SEED_ITEMS, progression: SEED_PROGRESSION };
    const cdrItem = bySlug.get("transcendent-cooldown")!;
    expect(cdrItem.stats.cooldownReductionPct).toBe(50);

    let build = createBuild({
      abilityUpgrades: { stake: setUpgradeTier([false, false, false], 1) },
    });
    build = addItemToBuild(build, cdrItem);

    const r = calculateBuild(build, ctx);
    const stake = r.abilities.find((a) => a.key === "stake")!;
    expect(stake.effectiveCooldown).toBeCloseTo(9, 6);
  });

  it("lets snipe stacks buff the regular gun, but not Assassinate's own shot", () => {
    // gunDamagePerStack ("kills grant +6% weapon damage per stack") is a
    // regular-bullet buff. Assassinate is spirit damage and does not read it.
    const ctx = { hero: SEED_HERO, items: SEED_ITEMS, progression: SEED_PROGRESSION };
    const noStacks = calculateBuild(createBuild({ boons: 27, snipeStacks: 0 }), ctx);
    const withStacks = calculateBuild(createBuild({ boons: 27, snipeStacks: 10 }), ctx);
    const profileNoStacks = noStacks.damageProfiles.find((p) => p.key === "assassinate")!;
    const profileWithStacks = withStacks.damageProfiles.find((p) => p.key === "assassinate")!;

    expect(withStacks.snipeStackBonus).toBeGreaterThan(0);
    expect(withStacks.bulletDamage).toBeGreaterThan(noStacks.bulletDamage);
    expect(profileWithStacks.base.shredded).toBeCloseTo(profileNoStacks.base.shredded, 6);
    expect(profileWithStacks.bonus.shredded).toBeCloseTo(profileNoStacks.bonus.shredded, 6);
  });

  it("gives ability damage a raw/shredded split, so the shred toggle has something to switch", () => {
    // Stake is spirit damage, and Crow Familiar's own passive shred (0.06/0.06,
    // always on) lifts totalDamage the same way it lifts a spirit bullet. This
    // used to be a single number that always equalled the shredded figure,
    // leaving the "no shred" toggle a no-op for every ability.
    const ctx = { hero: SEED_HERO, items: SEED_ITEMS, progression: SEED_PROGRESSION };
    const r = calculateBuild(createBuild({ boons: 27 }), ctx);
    const stake = r.abilities.find((a) => a.key === "stake")!;

    expect(r.spiritResistShred).toBeGreaterThan(0);
    expect(stake.totalDamage.raw).toBeGreaterThan(0);
    expect(stake.totalDamage.shredded / stake.totalDamage.raw).toBeCloseTo(
      1 + r.spiritResistShred,
      6,
    );
    expect(stake.totalDamage.raw).not.toBeCloseTo(stake.totalDamage.shredded, 3);
  });

  it("produces a sane build with the live data", () => {
    const ctx = { hero: SEED_HERO, items: SEED_ITEMS, progression: SEED_PROGRESSION };
    const r = calculateBuild(createBuild({ boons: 27 }), ctx);
    expect(r.groundDps).toBeGreaterThan(0);
    expect(r.health).toBeGreaterThan(1000);
    expect(r.warnings).toEqual([]);
  });
});
