/**
 * Tests for the purchase timeline: buy order, 50% sell refunds, component
 * absorption, the 12-slot cap and the souls-earned thresholds the slider cuts
 * through.
 */
import { describe, expect, it } from "vitest";
import { MAX_ITEM_SLOTS, planCost, planTimeline, simulateTimeline } from "./timeline";
import { createBuild, createBuildItem } from "../build";
import type { Build, Item } from "../types";

function item(slug: string, cost: number, components: string[] = []): Item {
  return {
    id: slug,
    slug,
    name: slug,
    category: "Weapon",
    cost,
    tier: 1,
    activation: "Passive",
    iconUrl: null,
    components,
    shopFilters: [],
    stats: {},
    enabled: true,
    sortOrder: 0,
  };
}

const ITEMS: Item[] = [
  item("a", 1000),
  item("b", 2000),
  item("c", 4000),
  item("upgrade", 3000, ["a"]),
  ...Array.from({ length: 14 }, (_, i) => item(`f${i}`, 500)),
];

function build(slugs: string[], partial: Partial<Build> = {}): Build {
  const bySlug = new Map(ITEMS.map((i) => [i.slug, i]));
  return createBuild({
    items: slugs.map((s) => createBuildItem(bySlug.get(s)!)),
    ...partial,
  });
}

describe("buy order", () => {
  it("buys in the order given, as souls allow", () => {
    const b = build(["a", "b", "c"]);
    const at = (souls: number) => [...simulateTimeline(b, ITEMS, souls).heldSlugs];

    expect(at(0)).toEqual([]);
    expect(at(999)).toEqual([]);
    expect(at(1000)).toEqual(["a"]);
    expect(at(2999)).toEqual(["a"]);
    expect(at(3000)).toEqual(["a", "b"]);
    expect(at(6999)).toEqual(["a", "b"]);
    expect(at(7000)).toEqual(["a", "b", "c"]);
  });

  it("saves up for the next item rather than skipping to a cheaper one", () => {
    // c costs 4000 and comes before b, so 2000 buys nothing beyond a.
    const b = build(["a", "c", "b"]);
    expect([...simulateTimeline(b, ITEMS, 3000).heldSlugs]).toEqual(["a"]);
    expect([...simulateTimeline(b, ITEMS, 5000).heldSlugs]).toEqual(["a", "c"]);
  });

  it("reports the threshold of the next purchase and what is still pending", () => {
    const r = simulateTimeline(build(["a", "b", "c"]), ITEMS, 1000);
    expect(r.nextThreshold).toBe(3000);
    expect(r.pending.map((p) => p.slug)).toEqual(["b", "c"]);
    expect(r.leftover).toBe(0);
    expect(r.itemValue).toBe(1000);
  });

  it("exposes a breakpoint for every purchase, for the slider ticks", () => {
    expect(simulateTimeline(build(["a", "b", "c"]), ITEMS, 0).breakpoints).toEqual([
      1000, 3000, 7000,
    ]);
  });
});

describe("components", () => {
  it("charges only the difference and absorbs the component", () => {
    const b = build(["a", "upgrade"]);
    const early = simulateTimeline(b, ITEMS, 1000);
    expect([...early.heldSlugs]).toEqual(["a"]);

    // The upgrade lists at 3000 but absorbs the 1000 already held.
    const late = simulateTimeline(b, ITEMS, 3000);
    expect([...late.heldSlugs]).toEqual(["upgrade"]);
    expect(late.soulsSpent).toBe(3000);
    expect(late.itemValue).toBe(3000);
    expect(planCost(b, ITEMS)).toBe(3000);
  });

  it("does not refund an absorbed component, it is consumed", () => {
    const r = simulateTimeline(build(["a", "upgrade"]), ITEMS, 3000);
    expect(r.soulsRefunded).toBe(0);
    const steps = r.completed.flatMap((t) => t.steps);
    expect(steps.filter((s) => s.kind === "consume").map((s) => s.slug)).toEqual(["a"]);
    expect(steps.some((s) => s.kind === "sell")).toBe(false);
  });
});

describe("selling", () => {
  const thirteen = Array.from({ length: 13 }, (_, i) => `f${i}`);

  it("holds at most twelve items", () => {
    const r = simulateTimeline(build(thirteen), ITEMS, 100000);
    expect(r.heldSlugs.size).toBe(MAX_ITEM_SLOTS);
  });

  it("sells the item named by the sell order", () => {
    const b = build(thirteen, { sellOrder: ["f3"] });
    const r = simulateTimeline(b, ITEMS, 100000);
    expect(r.heldSlugs.has("f3")).toBe(false);
    expect(r.heldSlugs.has("f0")).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("refunds half the price, and that refund is not income", () => {
    const b = build(thirteen, { sellOrder: ["f3"] });
    const r = simulateTimeline(b, ITEMS, 100000);
    expect(r.soulsRefunded).toBe(250); // half of 500
    // Twelve held at 500 each, funded by thirteen purchases less one refund.
    expect(r.itemValue).toBe(12 * 500);
    expect(r.soulsSpent - r.soulsRefunded).toBe(13 * 500 - 250);
    expect(planCost(b, ITEMS)).toBe(13 * 500 - 250);
  });

  it("warns and assumes the earliest purchase when no sell is authored", () => {
    const r = simulateTimeline(build(thirteen), ITEMS, 100000);
    expect(r.warnings.join(" ")).toContain("No sell order entry");
    expect(r.heldSlugs.has("f0")).toBe(false); // the earliest, sold by assumption
    const assumed = r.completed.flatMap((t) => t.steps).filter((s) => s.assumed);
    expect(assumed).toHaveLength(1);
    expect(assumed[0].kind).toBe("sell");
  });

  it("does not warn before the plan actually reaches the sell", () => {
    // Only enough souls for the first few purchases, so no slot pressure yet.
    const r = simulateTimeline(build(thirteen), ITEMS, 2000);
    expect(r.warnings).toEqual([]);
  });

  it("flags a sell order entry the plan never needs", () => {
    const r = simulateTimeline(build(["a", "b"], { sellOrder: ["a"] }), ITEMS, 100000);
    expect(r.warnings.join(" ")).toContain("never needs to sell");
  });
});

describe("thresholds", () => {
  it("never moves backwards, since souls earned only goes up", () => {
    const { transactions } = planTimeline(build(["a", "b", "c"]), ITEMS);
    const thresholds = transactions.map((t) => t.threshold);
    expect(thresholds).toEqual([...thresholds].sort((x, y) => x - y));
  });

  it("is stable: the same souls figure always gives the same loadout", () => {
    const b = build(["a", "b", "c"]);
    const once = [...simulateTimeline(b, ITEMS, 4000).heldSlugs];
    const twice = [...simulateTimeline(b, ITEMS, 4000).heldSlugs];
    expect(once).toEqual(twice);
  });
});
