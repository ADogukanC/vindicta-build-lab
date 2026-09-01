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
import type { BuildItem, Item } from "../types";
import {
  itemContributions,
  purchaseCandidates,
  rankPurchaseCandidates,
  sensiblePurchaseCostFloor,
  type ItemContribution,
} from "./metrics";

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
});

function fakeItem(slug: string, cost: number): Item {
  return {
    id: slug,
    slug,
    name: slug,
    category: "Weapon",
    cost,
    tier: 1,
    activation: "Passive",
    iconUrl: null,
    components: [],
    shopFilters: [],
    stats: {},
    enabled: true,
    sortOrder: 0,
  };
}

function fakeRow(slug: string, cost: number, delta: number): ItemContribution {
  return { item: fakeItem(slug, cost), delta, deltaPer1kSouls: (delta / cost) * 1000, cost };
}

describe("sensiblePurchaseCostFloor", () => {
  it("is a no-op at the cheapest tier below ~12.5k souls and rises to the 6400 tier above ~35k", () => {
    expect(sensiblePurchaseCostFloor(0)).toBe(800);
    expect(sensiblePurchaseCostFloor(12500)).toBe(800);
    expect(sensiblePurchaseCostFloor(35000)).toBe(6400);
    expect(sensiblePurchaseCostFloor(100000)).toBe(6400);
    // Midpoint of the ramp lands on the midpoint of the two floors.
    expect(sensiblePurchaseCostFloor((12500 + 35000) / 2)).toBeCloseTo((800 + 6400) / 2, 6);
  });
});

describe("rankPurchaseCandidates", () => {
  it("lets a cheap item's better raw ratio win early, but not once its cost tier has passed", () => {
    // Naive per-1k-souls ratio: cheap (12.5) beats pricey (9.375).
    const cheap = fakeRow("cheap", 800, 10);
    const pricey = fakeRow("pricey", 6400, 60);
    expect(cheap.deltaPer1kSouls).toBeGreaterThan(pricey.deltaPer1kSouls);

    // Below the 12.5k anchor the floor is a no-op (800), so the cheap item's
    // real cost is used as-is and its better ratio still wins.
    expect(rankPurchaseCandidates([cheap, pricey], 5000)[0].item.slug).toBe("cheap");

    // Above the 35k anchor the floor rises to the 6400 tier: the cheap item
    // is judged as if it cost 6400 (10/6400*1000 = 1.5625), well under the
    // pricier item's untouched 9.375, flipping the order.
    expect(rankPurchaseCandidates([cheap, pricey], 40000)[0].item.slug).toBe("pricey");
  });

  it("still lets an exceptional cheap item win late, per the exception the floor leaves room for", () => {
    const cheap = fakeRow("cheap", 800, 100); // 100/6400*1000 = 15.625 even floored
    const pricey = fakeRow("pricey", 6400, 60); // 60/6400*1000 = 9.375
    expect(rankPurchaseCandidates([cheap, pricey], 40000)[0].item.slug).toBe("cheap");
  });

  it("never lowers an item's own cost, so a purchase already at or above the floor is judged on its true ratio", () => {
    // Both items are already priced at the 40k-souls floor (6400), so the
    // floor cannot touch either one - the higher true ratio simply wins.
    const strong = fakeRow("strong", 6400, 40); // 40/6400*1000 = 6.25
    const weak = fakeRow("weak", 6400, 20); // 20/6400*1000 = 3.125
    expect(rankPurchaseCandidates([weak, strong], 40000)[0].item.slug).toBe("strong");
  });
});
