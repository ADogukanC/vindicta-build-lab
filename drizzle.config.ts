import { defineConfig } from "drizzle-kit";

// Migrations need the direct (non-pooled) connection — PgBouncer's
// transaction-mode pooling doesn't support the session-level statements
// drizzle-kit issues. Runtime queries use the pooled DATABASE_URL instead
// (see lib/data/db/client.ts).
export default defineConfig({
  schema: "./src/lib/data/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED!,
  },
});
