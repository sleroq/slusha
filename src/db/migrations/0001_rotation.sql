ALTER TABLE "events" ADD COLUMN "released" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "generation" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "pending_rotation" boolean DEFAULT false NOT NULL;
