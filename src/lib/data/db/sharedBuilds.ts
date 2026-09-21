import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, ilike, ne, sql } from "drizzle-orm";
import { getDb } from "./client";
import { sharedBuilds } from "./schema";
import type { SharedBuild } from "../../buildCode";

const CODE_ATTEMPTS = 5;

function newCode(): string {
  // 6 random bytes -> 8 base64url chars, ~48 bits of entropy: short enough
  // for a shareable link, astronomically unlikely to collide at this scale.
  return randomBytes(6).toString("base64url");
}

/** Creates a share row (status `private`) and returns its short code. */
export async function createSharedBuild(payload: SharedBuild): Promise<string> {
  const db = getDb();
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const code = newCode();
    try {
      await db.insert(sharedBuilds).values({ code, name: payload.name, payload });
      return code;
    } catch (err) {
      // Unique-violation on `code` — vanishingly rare, just draw another.
      const isConflict = err instanceof Error && /unique|duplicate/i.test(err.message);
      if (!isConflict || attempt === CODE_ATTEMPTS - 1) throw err;
    }
  }
  throw new Error("Could not allocate a share code.");
}

/** Looks up a shared build by its code, regardless of status — a direct link works whether or not it's public. */
export async function getSharedBuildByCode(code: string) {
  const [row] = await getDb().select().from(sharedBuilds).where(eq(sharedBuilds.code, code)).limit(1);
  return row ?? null;
}

/**
 * Finds a name safe to list publicly as `desired` — unchanged if nothing
 * public already uses it (case-insensitive exact match via `lower()`, not
 * `ilike`, since a name can itself contain `%` or `_`, which `ilike` would
 * treat as wildcards), otherwise `"<desired> (2)"`, `"(3)"`, ... `excludeCode`
 * is the row being published itself, so republishing an already-public build
 * doesn't collide with its own name.
 */
async function uniquePublicName(
  db: ReturnType<typeof getDb>,
  desired: string,
  excludeCode: string,
): Promise<string> {
  const base = desired.trim() || "Unnamed build";
  let candidate = base;
  for (let suffix = 2; suffix <= 200; suffix++) {
    const [clash] = await db
      .select({ code: sharedBuilds.code })
      .from(sharedBuilds)
      .where(
        and(
          eq(sharedBuilds.status, "public"),
          eq(sql`lower(${sharedBuilds.name})`, candidate.toLowerCase()),
          ne(sharedBuilds.code, excludeCode),
        ),
      )
      .limit(1);
    if (!clash) return candidate;
    candidate = `${base} (${suffix})`;
  }
  return `${base} (${Date.now()})`;
}

/**
 * Lists a build on the public build browser immediately — no admin approval
 * gate. A no-op if it's already public; returns the row's resulting status
 * and name either way, plus whether this call is what changed it.
 *
 * Names aren't unique and every Share click mints a brand new row rather
 * than updating one in place, so two unrelated people (or the same person,
 * twice) can easily submit the same name. Nothing here can tell "this is my
 * own updated build" from "a stranger happened to pick the same title", so
 * rather than guessing and silently replacing someone else's listing, a
 * newly-published build that collides with an already-public name gets
 * renamed instead — "Name (2)", "(3)", etc. — so both stay visible and
 * distinct on /browse. This also means a name can never again end up with
 * two simultaneously-public rows for an admin to lose track of (the original
 * trigger for this: deleting one still left the other looking like the
 * deleted build had come back).
 */
export async function publishSharedBuild(
  code: string,
): Promise<{ status: "public"; changed: boolean; name: string } | "not-found"> {
  const row = await getSharedBuildByCode(code);
  if (!row) return "not-found";
  if (row.status === "public") return { status: "public", changed: false, name: row.name };
  const db = getDb();
  const name = await uniquePublicName(db, row.name, code);
  await db
    .update(sharedBuilds)
    .set({ status: "public", publishedAt: new Date(), name, payload: { ...row.payload, name } })
    .where(eq(sharedBuilds.code, code));
  return { status: "public", changed: true, name };
}

/**
 * Admin-only rename of a shared build's display name — updates both the
 * indexed `name` column and the `name` inside its `payload` (the latter is
 * what a direct `/b/<code>` open and an /browse import actually surface),
 * so the two can't drift apart. No uniqueness enforcement: the admin can
 * already see the whole public list, so a collision they create on purpose
 * (or don't notice) is theirs to fix, not something to second-guess here.
 */
export async function renameSharedBuild(code: string, name: string): Promise<boolean> {
  const trimmed = name.trim().slice(0, 200);
  if (!trimmed) return false;
  const row = await getSharedBuildByCode(code);
  if (!row) return false;
  await getDb()
    .update(sharedBuilds)
    .set({ name: trimmed, payload: { ...row.payload, name: trimmed } })
    .where(eq(sharedBuilds.code, code));
  return true;
}

const PAGE_SIZE = 30;

/** Public builds for the build browser, newest first. */
export async function listPublicBuilds({ q, offset = 0 }: { q?: string; offset?: number } = {}) {
  const db = getDb();
  const conditions = [eq(sharedBuilds.status, "public")];
  if (q?.trim()) conditions.push(ilike(sharedBuilds.name, `%${q.trim()}%`));
  return db
    .select({
      code: sharedBuilds.code,
      name: sharedBuilds.name,
      payload: sharedBuilds.payload,
      createdAt: sharedBuilds.createdAt,
    })
    .from(sharedBuilds)
    .where(and(...conditions))
    .orderBy(desc(sharedBuilds.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);
}

/** Every public build, for the admin's own management view — not paginated like the public browser. */
export async function listAllPublicBuilds() {
  return getDb()
    .select({
      code: sharedBuilds.code,
      name: sharedBuilds.name,
      payload: sharedBuilds.payload,
      createdAt: sharedBuilds.createdAt,
    })
    .from(sharedBuilds)
    .where(eq(sharedBuilds.status, "public"))
    .orderBy(desc(sharedBuilds.createdAt));
}

/**
 * Removes a shared build outright — used to pull a stale public listing once
 * its owner has a better version to share instead. Also kills the
 * `/b/<code>` link, not just the browse listing; there's no soft "unlist but
 * keep the link" middle ground here, same as the rest of this table has no
 * soft-delete. Admin-only (see the route).
 */
export async function deleteSharedBuild(code: string): Promise<boolean> {
  const result = await getDb()
    .delete(sharedBuilds)
    .where(eq(sharedBuilds.code, code))
    .returning({ code: sharedBuilds.code });
  return result.length > 0;
}
