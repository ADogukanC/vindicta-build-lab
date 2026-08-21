CREATE TABLE "shared_builds" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "shared_builds_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE INDEX "shared_builds_status_created_at_idx" ON "shared_builds" USING btree ("status","created_at");