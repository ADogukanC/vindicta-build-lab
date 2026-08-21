import type { Build, BuildItem, Item } from "./types";

export const BUILD_COLORS = [
  "#f0a24b",
  "#5cc8ff",
  "#9d7bff",
  "#4bd68a",
  "#ff6b8a",
  "#ffd75e",
  "#59e0d0",
  "#ff8f5c",
];

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Ability upgrades are bought in order, so a taken list is always a prefix:
 * [true, false, false] is legal, [true, false, true] is not.
 */
export function normalizeUpgrades(taken: boolean[] | undefined, length = 3): boolean[] {
  const out: boolean[] = [];
  let stillTaken = true;
  for (let i = 0; i < length; i++) {
    stillTaken = stillTaken && Boolean(taken?.[i]);
    out.push(stillTaken);
  }
  return out;
}

/** Selecting tier `index` takes every tier up to it; clearing it drops the rest. */
export function setUpgradeTier(taken: boolean[], index: number): boolean[] {
  const turningOff = Boolean(taken[index]);
  return [0, 1, 2].map((i) => (turningOff ? i < index : i <= index));
}

/**
 * A new build starts with no ability points spent — the player hasn't
 * played the match yet. (The workbook's own reference build assumed Flight
 * fully upgraded, but that's specific to that one sample build, not a sane
 * default for every build someone creates; see `WORKBOOK_UPGRADES` in
 * `engine.test.ts` for that.)
 */
export const DEFAULT_ABILITY_UPGRADES: Record<string, boolean[]> = {
  stake: [false, false, false],
  flight: [false, false, false],
  "crow-familiar": [false, false, false],
  assassinate: [false, false, false],
};

export function createBuild(partial: Partial<Build> = {}): Build {
  const now = Date.now();
  return {
    id: newId(),
    name: "New build",
    heroSlug: "vindicta",
    createdAt: now,
    updatedAt: now,
    soulsEarned: 50000,
    boons: 27,
    boonsFromSouls: true,
    snipeStacks: 5,
    headshotRate: 0,
    enemyBulletResistPct: 0,
    enemySpiritResistPct: 0,
    abilityUpgrades: structuredCloneUpgrades(DEFAULT_ABILITY_UPGRADES),
    apOrder: [],
    crowShredActive: true,
    // In game, spirit items do raise Vindicta's bullet damage. The workbook fed
    // only pre-item spirit into that scaling; the app defaults to the correct
    // behaviour and keeps the flag so workbook parity can still be reproduced.
    gunDamageUsesTotalSpirit: true,
    items: [],
    sellOrder: [],
    imbueTargets: {},
    adjustables: { fireRatePct: 0, bulletDamagePct: 0, spiritPowerFlat: 0, ammoPct: 0 },
    notes: "",
    rangeMeters: 20,
    color: BUILD_COLORS[0],
    ...partial,
  };
}

function structuredCloneUpgrades(source: Record<string, boolean[]>): Record<string, boolean[]> {
  return Object.fromEntries(Object.entries(source).map(([k, v]) => [k, v.slice()]));
}

/** A build entry seeded from the item's own defaults. */
export function createBuildItem(item: Item): BuildItem {
  return {
    slug: item.slug,
    active: item.conditional ? item.conditional.defaultActive : true,
    stacks: item.defaultStacks ?? item.maxStacks ?? 0,
    shredActive: item.defaultShredActive ?? true,
  };
}

/** Every slug this item is built from, following component chains all the way down. */
export function componentClosure(item: Item, items: Item[]): Set<string> {
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  const out = new Set<string>();
  const walk = (slug: string) => {
    const current = bySlug.get(slug);
    if (!current) return;
    for (const component of current.components ?? []) {
      if (out.has(component)) continue;
      out.add(component);
      walk(component);
    }
  };
  walk(item.slug);
  return out;
}

/**
 * Appends a purchase to the end of the build's buy order.
 *
 * Components are *not* stripped here any more: a plan may legitimately buy
 * Extended Magazine early and upgrade to Titanic Magazine later, so both belong
 * in the order. The timeline absorbs the component at the moment the upgrade is
 * bought, which is when it actually happens.
 */
export function addItemToBuild(build: Build, item: Item): Build {
  if (build.items.some((i) => i.slug === item.slug)) return build;
  return { ...build, items: [...build.items, createBuildItem(item)], updatedAt: Date.now() };
}

/** Moves a purchase to a new position in the buy order. */
export function moveBuildItem(build: Build, from: number, to: number): Build {
  if (from === to || from < 0 || from >= build.items.length) return build;
  const items = build.items.slice();
  const [moved] = items.splice(from, 1);
  items.splice(Math.max(0, Math.min(items.length, to)), 0, moved);
  return { ...build, items, updatedAt: Date.now() };
}

/** Moves an entry within the sell order. */
export function moveSellOrder(build: Build, from: number, to: number): Build {
  const sellOrder = [...(build.sellOrder ?? [])];
  if (from === to || from < 0 || from >= sellOrder.length) return build;
  const [moved] = sellOrder.splice(from, 1);
  sellOrder.splice(Math.max(0, Math.min(sellOrder.length, to)), 0, moved);
  return { ...build, sellOrder, updatedAt: Date.now() };
}

export function setSellOrder(build: Build, sellOrder: string[]): Build {
  return { ...build, sellOrder, updatedAt: Date.now() };
}

export function removeItemFromBuild(build: Build, slug: string): Build {
  return {
    ...build,
    items: build.items.filter((i) => i.slug !== slug),
    sellOrder: (build.sellOrder ?? []).filter((s) => s !== slug),
    updatedAt: Date.now(),
  };
}

export function updateBuildItem(build: Build, slug: string, patch: Partial<BuildItem>): Build {
  return {
    ...build,
    items: build.items.map((i) => (i.slug === slug ? { ...i, ...patch } : i)),
    updatedAt: Date.now(),
  };
}

export function duplicateBuild(build: Build, name?: string): Build {
  const now = Date.now();
  return {
    ...build,
    id: newId(),
    name: name ?? `${build.name} (copy)`,
    createdAt: now,
    updatedAt: now,
    items: build.items.map((i) => ({ ...i })),
    sellOrder: [...(build.sellOrder ?? [])],
    apOrder: [...(build.apOrder ?? [])],
    imbueTargets: { ...(build.imbueTargets ?? {}) },
    adjustables: { ...build.adjustables },
    abilityUpgrades: structuredCloneUpgrades(build.abilityUpgrades ?? {}),
  };
}

/** Older builds stored three booleans instead of a full upgrade table. */
interface LegacyTierFlags {
  crowT3?: boolean;
  flightT3?: boolean;
  snipeT3?: boolean;
}

/**
 * Migrates a build loaded from storage or a share link so that fields added in
 * later versions have sane values instead of `undefined`.
 */
export function normalizeBuild(raw: Partial<Build> & LegacyTierFlags): Build {
  const base = createBuild();

  let abilityUpgrades = raw.abilityUpgrades;
  if (!abilityUpgrades) {
    abilityUpgrades = structuredCloneUpgrades(DEFAULT_ABILITY_UPGRADES);
    // Legacy builds only stored whether the third tier was taken. Taking T3
    // implies T1 and T2, so expand the flag into a full progression.
    const fromT3 = (t3: boolean) => (t3 ? [true, true, true] : [false, false, false]);
    if (raw.crowT3 !== undefined) abilityUpgrades["crow-familiar"] = fromT3(raw.crowT3);
    if (raw.flightT3 !== undefined) abilityUpgrades.flight = raw.flightT3 ? [true, true, true] : [true, false, false];
    if (raw.snipeT3 !== undefined) abilityUpgrades.assassinate = fromT3(raw.snipeT3);
  }
  abilityUpgrades = Object.fromEntries(
    Object.entries(abilityUpgrades).map(([key, taken]) => [key, normalizeUpgrades(taken)]),
  );

  return {
    ...base,
    ...raw,
    id: raw.id ?? base.id,
    // Not user-facing (no UI ever writes this) — it exists only so the
    // workbook-parity test fixture can pin the old pre-item-spirit math via
    // `createBuild({ gunDamageUsesTotalSpirit: false, ... })` directly. A real
    // build has no legitimate reason to carry `false`; the only way one does is
    // stale persisted data from before the app's default flipped to `true` (the
    // behaviour that actually matches the game). Always heal it back on load so
    // two builds with identical items can't silently diverge in DPS.
    gunDamageUsesTotalSpirit: true,
    abilityUpgrades,
    // Builds saved before the timeline existed were unordered sets shown in
    // full, so start them at the top of the range and let their stored order
    // stand in as the buy order.
    soulsEarned: raw.soulsEarned ?? 80000,
    headshotRate: raw.headshotRate ?? 0,
    boonsFromSouls: raw.boonsFromSouls ?? raw.soulsEarned !== undefined,
    sellOrder: raw.sellOrder ?? [],
    apOrder: raw.apOrder ?? [],
    imbueTargets: raw.imbueTargets ?? {},
    adjustables: { ...base.adjustables, ...(raw.adjustables ?? {}) },
    items: (raw.items ?? []).map((i) => ({
      slug: i.slug,
      active: i.active ?? true,
      stacks: i.stacks ?? 0,
      shredActive: i.shredActive ?? true,
    })),
  };
}
