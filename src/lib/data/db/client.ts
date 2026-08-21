import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Lazy: `neon()` throws if DATABASE_URL isn't set, and Next evaluates
// top-level module code at build time, before Vercel-provisioned env vars
// necessarily exist. A plain lazily-assigned `let` (not a Proxy) so nothing
// intercepts property/method lookups on the returned client.
function createDb() {
  const sql = neon(process.env.DATABASE_URL!);
  return drizzle(sql, { schema });
}

let _db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}
