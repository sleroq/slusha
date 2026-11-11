CREATE TABLE "users" ("id" bigint PRIMARY KEY NOT NULL, "username" text, "first_name" text NOT NULL, "info" jsonb NOT NULL, "last_seen" timestamp with time zone);
--> statement-breakpoint
CREATE TABLE "chats" ("id" bigint PRIMARY KEY NOT NULL, "type" text NOT NULL, "info" jsonb NOT NULL);
--> statement-breakpoint
CREATE TABLE "updates" ("id" bigint PRIMARY KEY NOT NULL, "payload" jsonb NOT NULL, "received_at" timestamp with time zone DEFAULT now(), "status" text DEFAULT 'pending');
--> statement-breakpoint
CREATE TABLE "events" ("id" bigserial PRIMARY KEY NOT NULL, "update_id" bigint UNIQUE, "chat_id" bigint NOT NULL, "topic_id" bigint DEFAULT 0 NOT NULL, "message_id" bigint, "user_id" bigint, "kind" text NOT NULL, "payload" jsonb NOT NULL, "occurred_at" timestamp with time zone NOT NULL, "opted_out" boolean DEFAULT false NOT NULL);
--> statement-breakpoint
CREATE INDEX "events_chat_topic_id_idx" ON "events" ("chat_id", "topic_id", "id");
--> statement-breakpoint
CREATE TABLE "conversations" ("chat_id" bigint NOT NULL, "topic_id" bigint DEFAULT 0 NOT NULL, "session_id" text NOT NULL, "context_event_id" bigint DEFAULT 0 NOT NULL, "accounted_input" bigint DEFAULT 0 NOT NULL, "accounted_output" bigint DEFAULT 0 NOT NULL, "accounted_cache_read" bigint DEFAULT 0 NOT NULL, PRIMARY KEY ("chat_id", "topic_id"));
--> statement-breakpoint
CREATE TABLE "settings" ("scope" text NOT NULL, "scope_id" text NOT NULL, "key" text NOT NULL, "value" jsonb NOT NULL, PRIMARY KEY ("scope", "scope_id", "key"));
--> statement-breakpoint
CREATE TABLE "opt_outs" ("chat_id" bigint NOT NULL, "user_id" bigint NOT NULL, PRIMARY KEY ("chat_id", "user_id"));
--> statement-breakpoint
CREATE TABLE "usage" ("account_type" text NOT NULL, "account_id" bigint NOT NULL, "week_start" date NOT NULL, "input_tokens" bigint DEFAULT 0 NOT NULL, "output_tokens" bigint DEFAULT 0 NOT NULL, "cache_read_tokens" bigint DEFAULT 0 NOT NULL, PRIMARY KEY ("account_type", "account_id", "week_start"));
--> statement-breakpoint
CREATE TABLE "summaries" ("chat_id" bigint NOT NULL, "kind" text NOT NULL, "content" text NOT NULL, PRIMARY KEY ("chat_id", "kind"));
--> statement-breakpoint
CREATE TABLE "chat_members" ("chat_id" bigint NOT NULL, "user_id" bigint NOT NULL, "last_seen" timestamp with time zone DEFAULT now(), PRIMARY KEY ("chat_id", "user_id"));
