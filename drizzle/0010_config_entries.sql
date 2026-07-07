CREATE TABLE `config_entries` (
    `scope_key` text NOT NULL,
    `key` text NOT NULL,
    `value` text NOT NULL,
    `updated_by` integer,
    `updated_at` integer DEFAULT 0 NOT NULL,
    PRIMARY KEY(`scope_key`, `key`)
);
--> statement-breakpoint
CREATE TABLE `config_entry_history` (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `scope_key` text NOT NULL,
    `key` text NOT NULL,
    `old_value` text,
    `new_value` text,
    `action` text NOT NULL,
    `updated_by` integer,
    `updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DROP TABLE IF EXISTS `global_config`;
--> statement-breakpoint
DROP TABLE IF EXISTS `chat_config_overrides`;
--> statement-breakpoint
ALTER TABLE `chats` DROP COLUMN `chat_model`;
--> statement-breakpoint
ALTER TABLE `chats` DROP COLUMN `messages_to_pass`;
--> statement-breakpoint
ALTER TABLE `chats` DROP COLUMN `random_reply_probability`;
--> statement-breakpoint
ALTER TABLE `chats` DROP COLUMN `locale`;
