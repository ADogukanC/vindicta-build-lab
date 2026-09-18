/**
 * The data layer for the game catalogue: items, hero config and progression,
 * held in the `game_data` table of the same Postgres database `shared_builds`
 * lives in (see `lib/data/db/schema.ts`). The admin panel's edits persist
 * there, which — unlike the old `data/local-db.json` file this replaced —
 * means they stick no matter which machine or deployment made them: local
 * dev and the deployed Vercel site both read and write the same rows.
 *
 * Builds are different: they live in the browser's IndexedDB, and sharing
 * one snapshots it into `shared_builds` (via `lib/data/db/sharedBuilds.ts`)
 * so it can get a short code and, if the sharer opts in, show up in the
 * admin-moderated build browser. See `src/lib/buildCode.ts` for the
 * fallback client-only path.
 */
import "server-only";
import { eq } from "drizzle-orm";
import type { HeroConfig, Item, Progression } from "../types";
import { getDb } from "./db/client";
import { gameData } from "./db/schema";
import { SEED_HERO, SEED_ITEMS, SEED_PROGRESSION } from "./seed";

interface FileShape {
  items: Item[];
  hero: HeroConfig;
  progression: Progression;
}

type Kind = keyof FileShape;

// Per-instance cache, same role the old file-store's cache played: a warm
// serverless instance (or the local dev server) skips the round trip on
// every request. Not shared across instances, so a write on one instance is
// picked up by another only once its own cache is invalidated or expires -
// acceptable here since admin edits are rare and not latency-sensitive.
let cache: FileShape | null = null;

async function read(): Promise<FileShape> {
  if (cache) return cache;
  try {
    const db = getDb();
    const rows = await db.select().from(gameData);
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    cache = {
      items: (byKey.get("items") as Item[] | undefined) ?? SEED_ITEMS,
      hero: (byKey.get("hero") as HeroConfig | undefined) ?? SEED_HERO,
      progression: (byKey.get("progression") as Progression | undefined) ?? SEED_PROGRESSION,
    };
  } catch (error) {
    // No DATABASE_URL (a fresh clone that hasn't run `vercel env pull` yet)
    // or the database is briefly unreachable - fall back to the bundled
    // seed rather than hard-failing every page in the app.
    console.error("game_data read failed, serving the bundled seed instead:", error);
    cache = { items: SEED_ITEMS, hero: SEED_HERO, progression: SEED_PROGRESSION };
  }
  return cache;
}

async function write(next: FileShape, changedKey: Kind): Promise<void> {
  cache = next;
  const db = getDb();
  await db
    .insert(gameData)
    .values({ key: changedKey, value: next[changedKey], updatedAt: new Date() })
    .onConflictDoUpdate({
      target: gameData.key,
      set: { value: next[changedKey], updatedAt: new Date() },
    });
}

export const store = {
  async getItems() {
    const db = await read();
    return db.items.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  },

  async saveItem(item: Item) {
    const db = await read();
    const items = db.items.slice();
    const index = items.findIndex((i) => i.slug === item.slug);
    if (index >= 0) items[index] = item;
    else items.push(item);
    await write({ ...db, items }, "items");
    return item;
  },

  async deleteItem(slug: string) {
    const db = await read();
    await write({ ...db, items: db.items.filter((i) => i.slug !== slug) }, "items");
  },

  async replaceAllItems(items: Item[]) {
    const db = await read();
    await write({ ...db, items }, "items");
  },

  async getHero() {
    return (await read()).hero;
  },

  async saveHero(hero: HeroConfig) {
    const db = await read();
    await write({ ...db, hero }, "hero");
    return hero;
  },

  async getProgression() {
    return (await read()).progression;
  },

  async saveProgression(progression: Progression) {
    const db = await read();
    await write({ ...db, progression }, "progression");
    return progression;
  },
};

export function getStore() {
  return store;
}

export async function getCalcContext() {
  const [items, hero, progression] = await Promise.all([
    store.getItems(),
    store.getHero(),
    store.getProgression(),
  ]);
  return { items: items.filter((i) => i.enabled), hero, progression };
}
