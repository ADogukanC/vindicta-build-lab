/**
 * Pushes the bundled seed (data/seed-items.json, seed-hero.json,
 * seed-progression.json) into the `game_data` table, overwriting whatever is
 * live there.
 *
 * Item/hero/progression data used to live in data/local-db.json on whichever
 * machine ran the app, so a balance patch landed the moment its edit to
 * data/seed-items.json (or the admin panel) was saved. Now that this data
 * lives in the shared Postgres database instead — so admin edits persist on
 * the deployed site, not just wherever `npm run dev` happens to be running —
 * a patch written directly into the seed JSON (as opposed to made through the
 * admin panel, which writes straight to the database) needs this script to
 * actually go live. The admin panel remains the way to make one-off edits
 * that persist immediately with no script to run.
 *
 * Run after hand-editing data/seed-items.json for a patch, or after
 * `refresh-item-data`'s wiki re-import:
 *
 *   npm run db:sync-seed
 *
 * This overwrites the live items/hero/progression with the bundled seed
 * unconditionally — any admin-panel edits made since the last sync are lost.
 * Re-export first (Admin panel > Export items) if in doubt.
 */
import { neon } from "@neondatabase/serverless";
import { SEED_HERO, SEED_ITEMS, SEED_PROGRESSION } from "../src/lib/data/seed";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set — run this via `npm run db:sync-seed` (loads .env.local).");
  }
  const sql = neon(url);
  const upsert = (key: string, value: unknown) =>
    sql`
      insert into game_data (key, value, updated_at)
      values (${key}, ${JSON.stringify(value)}::jsonb, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()
    `;
  await upsert("items", SEED_ITEMS);
  await upsert("hero", SEED_HERO);
  await upsert("progression", SEED_PROGRESSION);
  console.log(
    `Synced ${SEED_ITEMS.length} items, the hero config and progression table into game_data.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
