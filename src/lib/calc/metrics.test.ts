/**
 * `itemContributions` and `purchaseCandidates` used to reason about the whole
 * ordered purchase plan (`build.items`) rather than the loadout actually held
 * at the build's souls figure. That let a purchase still pending later in the
 * plan leak into a held item's "removed" test, and let it get force-purchased
 * (with invented souls-earned and invented boons) whenever a candidate item's
 * cost pushed past the current souls figure. These tests pin both down.
 */
import { describe, expect, it } from "vitest";
import { SEED_HERO, SEED_ITEMS, SEED_PROGRESSION } from "../data/seed";
import { createBuild, createBuildItem } from "../build";
import type { BuildItem } from "../types";
import { itemContributions, purchaseCandidates } from "./metrics";

const ctx = { hero: SEED_HERO, items: SEED_ITEMS, progression: SEED_PROGRESSION };
const bySlug = new Map(SEED_ITEMS.map((i) => [i.slug, i]));
const closeQuarters = bySlug.get("close-quarters")!;
const extendedMagazine = bySlug.get("extended-magazine")!;
const cheatDeath = bySlug.get("cheat-death")!; // 6400 souls, well past the souls figure below
const extraHealth = bySlug.get("extra-health")!;
// Fire rate only from a conditional (defaults off) per-stack bonus — a good
// probe for the active/stack assumption behaviour below.
const glassCannon = bySlug.get("glass-cannon")!;

describe("itemContributions", () => {
  it("only scores items actually held at the build's souls figure", () => {
    // Cheat Death is in the plan but, at 1600 souls earned, hasn't been
    // reached yet - it should not appear as an "owned" item to score.
    const build = createBuild({
      items: [createBuildItem(closeQuarters), createBuildItem(extendedMagazine), createBuildItem(cheatDeath)],
      soulsEarned: 1600,
    });
    const rows = itemContributions(build, ctx, "groundDps");
    expect(rows.map((r) => r.item.slug).sort()).toEqual(["close-quarters", "extended-magazine"]);
  });

  it("forces a held conditional item's bonus on even if the saved build has it toggled off", () => {
    // Glass Cannon's fire rate lives entirely behind a conditional the item
    // defaults to off; a saved build sitting on that default should not zero
    // out its own value-per-soul figure.
    const entry: BuildItem = { ...createBuildItem(glassCannon), active: false };
    const build = createBuild({ items: [entry], soulsEarned: 50000 });
    const row = itemContributions(build, ctx, "fireRate", "full").find((r) => r.item.slug === "glass-cannon");
    expect(row?.delta).toBeGreaterThan(0);
  });
});

describe("purchaseCandidates", () => {
  it("prices a candidate off itself, unaffected by an unrelated pending purchase later in the plan", () => {
    // Same held loadout (just Close Quarters) in both builds; the "noisy"
    // one also has Cheat Death sitting pending in the plan, past reach at
    // this souls figure. A candidate's price and value should not depend on
    // an unrelated purchase it was never inserted next to.
    const clean = createBuild({
      items: [createBuildItem(closeQuarters)],
      soulsEarned: 800,
    });
    const noisy = createBuild({
      items: [createBuildItem(closeQuarters), createBuildItem(cheatDeath)],
      soulsEarned: 800,
    });

    const cleanCandidate = purchaseCandidates(clean, ctx, "health", 50).find(
      (c) => c.item.slug === "extra-health",
    )!;
    const noisyCandidate = purchaseCandidates(noisy, ctx, "health", 50).find(
      (c) => c.item.slug === "extra-health",
    )!;

    expect(cleanCandidate).toBeDefined();
    expect(noisyCandidate).toBeDefined();
    // The candidate costs exactly its own sticker price - Cheat Death's 6400
    // must not be folded into it.
    expect(cleanCandidate.cost).toBe(800);
    expect(noisyCandidate.cost).toBe(800);
    expect(noisyCandidate.delta).toBeCloseTo(cleanCandidate.delta, 6);
    expect(noisyCandidate.deltaPer1kSouls).toBeCloseTo(cleanCandidate.deltaPer1kSouls, 6);
  });

  it("does not invent boons to afford a candidate that outpaces the current souls figure", () => {
    // 800 souls earned isn't enough to also hold a 6400-souls item, so
    // reaching it requires bumping the simulated souls-earned figure - which
    // must not be allowed to bump the boon count (and therefore every
    // boon-scaled stat) along with it.
    const build = createBuild({ items: [createBuildItem(closeQuarters)], soulsEarned: 800 });

    const withoutBump = purchaseCandidates(build, ctx, "health", 50).find(
      (c) => c.item.slug === "extra-health",
    )!;
    // Extra Health only grants a flat 210 health with no per-boon term, so
    // its own delta is a fixed number independent of boons. If boons leaked
    // in from an invented souls-earned figure the health metric would move
    // by more than a single copy of the item's own bonus could explain.
    expect(withoutBump.delta).toBeLessThan(300);
    expect(withoutBump.delta).toBeGreaterThan(0);
  });

  it("assumes an unowned conditional item is active and honors the stack assumption toggle", () => {
    const build = createBuild({ items: [createBuildItem(closeQuarters)], soulsEarned: 50000 });

    const full = purchaseCandidates(build, ctx, "fireRate", 200, "full").find(
      (c) => c.item.slug === "glass-cannon",
    );
    // Glass Cannon's only fire rate comes from its per-stack bonus, gated
    // behind a conditional the item defaults to *off* - "what should I buy
    // next" must assume it's actually used, or the item's whole value here
    // vanishes from the ranking.
    expect(full?.delta).toBeGreaterThan(0);

    // At "no stacks" the per-stack bonus is zero regardless of the forced
    // active toggle, so the item contributes nothing to fire rate and drops
    // out of the candidate list entirely.
    const none = purchaseCandidates(build, ctx, "fireRate", 200, "none").find(
      (c) => c.item.slug === "glass-cannon",
    );
    expect(none).toBeUndefined();

    const half = purchaseCandidates(build, ctx, "fireRate", 200, "half").find(
      (c) => c.item.slug === "glass-cannon",
    );
    expect(half?.delta).toBeGreaterThan(0);
    expect(half!.delta).toBeLessThan(full!.delta);
  });

  it("prices a candidate off the held loadout's own cost, not the plan's gross historical spend", () => {
    // Cheat Death (6400 souls) is bought first and then sold to free a slot
    // for a twelfth item, so the plan's gross historical spend (all thirteen
    // buys) runs 6400 souls above what the twelve items it's currently
    // holding are actually worth - the situation any build reaches once it
    // has sold something pricier than a later candidate on the way to its
    // current loadout. A candidate's netCost must be priced off the held
    // loadout alone: pricing it against gross spend instead would make
    // Extra Health's netCost negative, clamp to 0, and zero out its /1k
    // ranking number along with every other candidate's. The fillers below
    // are all standalone (no components field, no upgrade built from one of
    // the others), so nothing here frees a slot by absorption instead of by
    // the sell this test means to exercise.
    const fillerSlugs = [
      "close-quarters",
      "extra-regen",
      "extra-stamina",
      "grit",
      "healing-rite",
      "melee-lifesteal",
      "rebuttal",
      "battle-vest",
      "bullet-lifesteal",
      "debuff-reducer",
      "enchanters-emblem",
      "spirit-lifesteal",
    ];
    const fillers = fillerSlugs.map((slug) => bySlug.get(slug)!);
    const build = createBuild({
      items: [createBuildItem(cheatDeath), ...fillers.map((i) => createBuildItem(i))],
      sellOrder: [cheatDeath.slug],
      soulsEarned: 100000,
    });
    const candidate = purchaseCandidates(build, ctx, "health", 100).find(
      (c) => c.item.slug === "extra-health",
    );
    expect(candidate).toBeDefined();
    // Extra Health's true net cost is its own sticker price (no components
    // to absorb) - not ~0, and not deflated by the sold Cheat Death.
    expect(candidate!.cost).toBe(extraHealth.cost);
    expect(candidate!.deltaPer1kSouls).toBeGreaterThan(0);
  });

  it("doesn't contaminate a candidate's value with an unrelated auto-sell when the loadout is already full", () => {
    // Twelve held items - a real build reaching max souls will often be at
    // the 12-slot cap. Without a sell order, buying a 13th item there
    // normally forces the timeline to auto-sell whatever was bought first
    // just to make room, and that unrelated loss used to swamp the
    // candidate's own number. Evaluating "what should I buy next" is a
    // hypothetical, not a concrete sell decision, so the slot cap must be
    // lifted for this one simulation.
    const fillers = SEED_ITEMS.filter((i) => i.enabled && i.slug !== "extra-health").slice(0, 12);
    const build = createBuild({
      items: fillers.map((i) => createBuildItem(i)),
      soulsEarned: 100000,
    });
    const candidate = purchaseCandidates(build, ctx, "health", 100).find(
      (c) => c.item.slug === "extra-health",
    );
    expect(candidate).toBeDefined();
    // Extra Health only ever adds health - a leftover slot-cap bug would show
    // a large negative number here instead, from auto-selling a filler item.
    expect(candidate!.delta).toBeGreaterThan(0);
  });

  it("ranks candidates purely by raw value per soul, with no net-worth-stage weighting", () => {
    // At a late-game souls figure, a net-worth-weighted floor would have
    // penalised cheap items in the ranking. With that gone, the returned
    // order must exactly match a plain sort on the candidates' own
    // deltaPer1kSouls, unweighted by the build's souls-earned figure.
    const build = createBuild({ items: [createBuildItem(closeQuarters)], soulsEarned: 62800 });
    const rows = purchaseCandidates(build, ctx, "health", 100);
    const sorted = [...rows].sort((a, b) => b.deltaPer1kSouls - a.deltaPer1kSouls);
    expect(rows.map((r) => r.item.slug)).toEqual(sorted.map((r) => r.item.slug));
  });
});
