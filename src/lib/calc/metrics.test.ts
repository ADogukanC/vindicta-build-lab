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

  it("ranks candidates purely by raw value per soul, with no cost-floor weighting", () => {
    // At a late-game souls figure, a cost floor would have penalised cheap
    // items in the ranking. With the floor gone, the returned order must
    // exactly match a plain sort on the candidates' own deltaPer1kSouls.
    const build = createBuild({ items: [createBuildItem(closeQuarters)], soulsEarned: 62800 });
    const rows = purchaseCandidates(build, ctx, "health", 100);
    const sorted = [...rows].sort((a, b) => b.deltaPer1kSouls - a.deltaPer1kSouls);
    expect(rows.map((r) => r.item.slug)).toEqual(sorted.map((r) => r.item.slug));
  });
});
