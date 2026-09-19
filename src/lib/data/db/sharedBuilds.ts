import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, ilike } from "drizzle-orm";
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
 * Lists a build on the public build browser immediately — no admin approval
 * gate. A no-op if it's already public; returns the row's resulting status
 * either way, plus whether this call is what changed it.
 */
export async function publishSharedBuild(
  code: string,
): Promise<{ status: "public"; changed: boolean } | "not-found"> {
  const row = await getSharedBuildByCode(code);
  if (!row) return "not-found";
  if (row.status === "public") return { status: "public", changed: false };
  await getDb()
    .update(sharedBuilds)
    .set({ status: "public", publishedAt: new Date() })
    .where(eq(sharedBuilds.code, code));
  return { status: "public", changed: true };
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
