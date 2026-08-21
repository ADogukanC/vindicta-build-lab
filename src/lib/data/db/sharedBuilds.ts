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
 * Opts a build into the public browser. A no-op if it's already pending or
 * approved; returns the row's resulting status either way, plus whether this
 * call is what changed it.
 */
export async function submitForReview(
  code: string,
): Promise<{ status: "pending" | "approved"; changed: boolean } | "not-found"> {
  const row = await getSharedBuildByCode(code);
  if (!row) return "not-found";
  if (row.status === "pending" || row.status === "approved") {
    return { status: row.status, changed: false };
  }
  await getDb()
    .update(sharedBuilds)
    .set({ status: "pending", reviewedAt: null })
    .where(eq(sharedBuilds.code, code));
  return { status: "pending", changed: true };
}

const PAGE_SIZE = 30;

/** Approved builds for the public browser, newest first. */
export async function listApprovedBuilds({ q, offset = 0 }: { q?: string; offset?: number } = {}) {
  const db = getDb();
  const conditions = [eq(sharedBuilds.status, "approved")];
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

/** Submissions waiting on admin review, oldest first (first in, first reviewed). */
export async function listPendingBuilds() {
  return getDb()
    .select({
      code: sharedBuilds.code,
      name: sharedBuilds.name,
      payload: sharedBuilds.payload,
      createdAt: sharedBuilds.createdAt,
    })
    .from(sharedBuilds)
    .where(eq(sharedBuilds.status, "pending"))
    .orderBy(sharedBuilds.createdAt);
}

/** Admin approve/reject. Returns false if the code doesn't exist. */
export async function reviewSubmission(code: string, approve: boolean): Promise<boolean> {
  const result = await getDb()
    .update(sharedBuilds)
    .set({ status: approve ? "approved" : "rejected", reviewedAt: new Date() })
    .where(eq(sharedBuilds.code, code))
    .returning({ code: sharedBuilds.code });
  return result.length > 0;
}
