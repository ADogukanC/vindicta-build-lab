/**
 * Shared/public builds — the one thing this app keeps in a real database
 * rather than `data/local-db.json`. A row is created the moment someone hits
 * Share (status `private`, reachable only by its code) and stays private
 * unless they separately submit it to the build browser (`pending`), which an
 * admin then has to approve before it's listable.
 */
import { index, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import type { SharedBuild } from "../../buildCode";

export type BuildStatus = "private" | "pending" | "approved" | "rejected";

export const sharedBuilds = pgTable(
  "shared_builds",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    /** The same {name, items, sellOrder, imbueTargets, apOrder} shape build codes encode. */
    payload: jsonb("payload").notNull().$type<SharedBuild>(),
    status: text("status").notNull().default("private").$type<BuildStatus>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  // Both the browse page and the admin queue filter by status and sort by
  // recency — approved/pending are the only statuses ever listed in bulk.
  (table) => [index("shared_builds_status_created_at_idx").on(table.status, table.createdAt)],
);
