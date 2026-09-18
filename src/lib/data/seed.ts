/**
 * The bundled seed: the item catalogue and Vindicta's configuration. This is
 * what a brand-new `game_data` database starts from (`npm run db:sync-seed`,
 * see `data/store.ts`) and what the app falls back to serving if the
 * database is unset or unreachable — the admin panel's live edits live in
 * the database, not here.
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
