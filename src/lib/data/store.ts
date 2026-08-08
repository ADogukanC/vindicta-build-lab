/**
 * The data layer: a local JSON file (`data/local-db.json`), seeded from the
 * workbook export. There is no database — the admin panel's edits (items,
 * hero config, progression) persist here on whatever machine runs the app.
 *
 * Builds themselves never touch this file at all: they live in the browser's
 * IndexedDB, and sharing one is a pure client-side encode/decode (see
 * `src/lib/buildCode.ts`) — no server involved, nothing to store.
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { HeroConfig, Item, Progression } from "../types";
import { SEED_HERO, SEED_ITEMS, SEED_PROGRESSION } from "./seed";

interface FileShape {
  items: Item[];
  hero: HeroConfig;
  progression: Progression;
}

const FILE_PATH = path.join(process.cwd(), "data", "local-db.json");

let cache: FileShape | null = null;

async function read(): Promise<FileShape> {
  if (cache) return cache;
  try {
    const text = await fs.readFile(FILE_PATH, "utf8");
    const parsed = JSON.parse(text) as Partial<FileShape>;
    cache = {
      items: parsed.items ?? SEED_ITEMS,
      hero: parsed.hero ?? SEED_HERO,
      progression: parsed.progression ?? SEED_PROGRESSION,
    };
  } catch {
    cache = { items: SEED_ITEMS, hero: SEED_HERO, progression: SEED_PROGRESSION };
  }
  return cache;
}

async function write(next: FileShape): Promise<void> {
  cache = next;
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(next, null, 2), "utf8");
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
    await write({ ...db, items });
    return item;
  },

  async deleteItem(slug: string) {
    const db = await read();
    await write({ ...db, items: db.items.filter((i) => i.slug !== slug) });
  },

  async replaceAllItems(items: Item[]) {
    const db = await read();
    await write({ ...db, items });
  },

  async getHero() {
    return (await read()).hero;
  },

  async saveHero(hero: HeroConfig) {
    const db = await read();
    await write({ ...db, hero });
    return hero;
  },

  async getProgression() {
    return (await read()).progression;
  },

  async saveProgression(progression: Progression) {
    const db = await read();
    await write({ ...db, progression });
    return progression;
  },
};

export function getStore() {
  return store;
}

/** Everything the calculator needs, in one round trip. */
export async function getCalcContext() {
  const [items, hero, progression] = await Promise.all([
    store.getItems(),
    store.getHero(),
    store.getProgression(),
  ]);
  return { items: items.filter((i) => i.enabled), hero, progression };
}
