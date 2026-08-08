/**
 * The bundled seed: 71 items, their icons and Vindicta's configuration, all
 * lifted straight out of the workbook. This is what the app serves until the
 * admin panel writes edits into `data/local-db.json` (see `data/store.ts`).
 */
import rawItems from "../../../data/seed-items.json";
import rawHero from "../../../data/seed-hero.json";
import rawProgression from "../../../data/seed-progression.json";
import type { HeroConfig, Item, Progression } from "../types";

export const SEED_ITEMS: Item[] = (rawItems as unknown as Item[]).map((it, index) => ({
  ...it,
  id: it.id ?? it.slug,
  stats: it.stats ?? {},
  enabled: it.enabled ?? true,
  sortOrder: it.sortOrder ?? index,
}));

export const SEED_HERO: HeroConfig = rawHero as unknown as HeroConfig;

export const SEED_PROGRESSION: Progression = rawProgression as unknown as Progression;
