/**
 * The purchase timeline.
 *
 * A build is an *ordered* plan, not a set: you buy items in sequence as souls
 * come in, selling to free a slot when all twelve are full. This module turns
 * that plan plus a souls-earned figure into the loadout you are actually
 * holding at that point in the match.
 *
 * The economy it models:
 *
 *  - **Souls earned** is monotonic. It is what boons key off, and it is the
 *    axis two builds are compared on.
 *  - **Buying** costs the item's price, minus the price of any components you
 *    already hold — those are absorbed into the upgrade, not sold.
 *  - **Selling** refunds 50% of the item's price into your pocket, and does
 *    *not* raise souls earned. A build that churns items therefore reaches a
 *    given loadout later than one that does not.
 *
 * The whole sequence is deterministic given the order, so every transaction's
 * soul threshold is computed once. Moving the slider is then just a cut through
 * a precomputed list, which is what makes the compare page's progression curve
 * cheap enough to sweep across the full range.
 */
import type { Build, BuildItem, Item } from "../types";
import { componentClosure } from "../build";

/** Weapon, Vitality and Spirit slots combined. */
export const MAX_ITEM_SLOTS = 12;

/** Fraction of an item's price you get back when selling it. */
export const SELL_REFUND = 0.5;

export type StepKind = "buy" | "sell" | "consume";

export interface TimelineStep {
  kind: StepKind;
  slug: string;
  name: string;
  /** Souls out for a buy, souls in for a sell, zero for a consumed component. */
  souls: number;
  /** True when the sell was inserted automatically because none was authored. */
  assumed?: boolean;
}

export interface TimelineTransaction {
  /** Index of this purchase within the build's item order. */
  index: number;
  slug: string;
  name: string;
  steps: TimelineStep[];
  /** Souls earned needed to have completed this transaction. */
  threshold: number;
  /** Cost of the purchase after components are absorbed. */
  netCost: number;
  /** Raised only once the plan actually reaches this purchase. */
  warning?: string;
}

export interface TimelineResult {
  /** The loadout held at this souls-earned figure, in purchase order. */
  held: BuildItem[];
  heldSlugs: Set<string>;
  /** Purchases not yet reached. */
  pending: BuildItem[];
  /** Transactions completed so far. */
  completed: TimelineTransaction[];
  /** Every transaction, whether reached or not. */
  transactions: TimelineTransaction[];
  /** Souls-earned values at which the loadout changes, for slider ticks. */
  breakpoints: number[];
  /** Souls earned required for the next purchase, or null when the plan is done. */
  nextThreshold: number | null;
  /** Gross outlay on purchases so far. */
  soulsSpent: number;
  /** Souls handed back by sells so far. */
  soulsRefunded: number;
  /** What the held loadout is worth at full price. */
  itemValue: number;
  /** Souls earned but not yet committed. */
  leftover: number;
  warnings: string[];
}

/** Plans the full sequence once, independent of how far along it you are. */
export function planTimeline(build: Build, items: Item[]): {
  transactions: TimelineTransaction[];
  warnings: string[];
} {
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  const transactions: TimelineTransaction[] = [];
  const warnings: string[] = [];

  // Slugs held as the plan is walked, in the order they were bought.
  const held: string[] = [];
  const sellQueue = [...(build.sellOrder ?? [])];
  let netSpend = 0;

  build.items.forEach((entry, index) => {
    const item = bySlug.get(entry.slug);
    if (!item) return;

    const steps: TimelineStep[] = [];
    let warning: string | undefined;

    // Components already held are absorbed into the upgrade rather than sold.
    const components = componentClosure(item, items);
    const absorbed = held.filter((slug) => components.has(slug));
    let netCost = item.cost;
    for (const slug of absorbed) {
      const component = bySlug.get(slug);
      if (!component) continue;
      netCost -= component.cost;
      steps.push({ kind: "consume", slug, name: component.name, souls: 0 });
      held.splice(held.indexOf(slug), 1);
    }
    netCost = Math.max(0, netCost);

    // Free a slot if all twelve are full.
    while (held.length >= MAX_ITEM_SLOTS) {
      let sellSlug = sellQueue.find((slug) => held.includes(slug));
      let assumed = false;
      if (sellSlug) {
        sellQueue.splice(sellQueue.indexOf(sellSlug), 1);
      } else {
        // Keep the plan usable rather than stalling, but say so loudly.
        sellSlug = held[0];
        assumed = true;
        warning =
          `No sell order entry for buying ${item.name} (purchase ${index + 1}). ` +
          `Assuming ${bySlug.get(sellSlug)?.name ?? sellSlug} is sold.`;
      }
      const sold = bySlug.get(sellSlug);
      const refund = Math.round((sold?.cost ?? 0) * SELL_REFUND);
      steps.push({
        kind: "sell",
        slug: sellSlug,
        name: sold?.name ?? sellSlug,
        souls: refund,
        assumed,
      });
      held.splice(held.indexOf(sellSlug), 1);
      netSpend -= refund;
    }

    netSpend += netCost;
    steps.push({ kind: "buy", slug: item.slug, name: item.name, souls: netCost });
    held.push(item.slug);

    // Souls earned only ever goes up, so a transaction can never become
    // reachable earlier than the one before it.
    const previous = transactions[transactions.length - 1]?.threshold ?? 0;
    transactions.push({
      index,
      slug: item.slug,
      name: item.name,
      steps,
      threshold: Math.max(previous, netSpend),
      netCost,
      warning,
    });
  });

  const unused = sellQueue.filter((slug) => bySlug.has(slug));
  if (unused.length) {
    warnings.push(
      `Sell order lists ${unused
        .map((slug) => bySlug.get(slug)?.name ?? slug)
        .join(", ")}, which the plan never needs to sell.`,
    );
  }

  return { transactions, warnings };
}

/** Walks the plan up to `soulsEarned` and reports the loadout held there. */
export function simulateTimeline(
  build: Build,
  items: Item[],
  soulsEarned: number,
): TimelineResult {
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  const entryBySlug = new Map(build.items.map((entry) => [entry.slug, entry]));
  const { transactions, warnings } = planTimeline(build, items);

  const completed = transactions.filter((t) => t.threshold <= soulsEarned);
  const reached = new Set(completed.map((t) => t.index));

  const heldSlugs: string[] = [];
  let soulsSpent = 0;
  let soulsRefunded = 0;
  for (const transaction of completed) {
    for (const step of transaction.steps) {
      if (step.kind === "buy") {
        soulsSpent += step.souls;
        heldSlugs.push(step.slug);
      } else if (step.kind === "sell") {
        soulsRefunded += step.souls;
        const at = heldSlugs.indexOf(step.slug);
        if (at >= 0) heldSlugs.splice(at, 1);
      } else {
        const at = heldSlugs.indexOf(step.slug);
        if (at >= 0) heldSlugs.splice(at, 1);
      }
    }
  }

  const held = heldSlugs
    .map((slug) => entryBySlug.get(slug))
    .filter((entry): entry is BuildItem => Boolean(entry));
  const pending = build.items.filter((_, index) => !reached.has(index));
  const itemValue = heldSlugs.reduce((sum, slug) => sum + (bySlug.get(slug)?.cost ?? 0), 0);
  const next = transactions.find((t) => t.threshold > soulsEarned) ?? null;

  return {
    held,
    heldSlugs: new Set(heldSlugs),
    pending,
    completed,
    transactions,
    breakpoints: [...new Set(transactions.map((t) => t.threshold))].sort((a, b) => a - b),
    nextThreshold: next?.threshold ?? null,
    soulsSpent,
    soulsRefunded,
    itemValue,
    leftover: Math.max(0, soulsEarned - (soulsSpent - soulsRefunded)),
    // Missing-sell warnings only matter once the plan reaches that purchase;
    // plan-level notes always apply.
    warnings: [
      ...completed.flatMap((t) => (t.warning ? [t.warning] : [])),
      ...warnings,
    ],
  };
}

/** The souls-earned figure at which the whole plan is complete. */
export function planCost(build: Build, items: Item[]): number {
  const { transactions } = planTimeline(build, items);
  return transactions[transactions.length - 1]?.threshold ?? 0;
}
