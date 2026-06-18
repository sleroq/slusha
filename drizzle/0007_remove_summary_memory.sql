DROP TABLE IF EXISTS `chat_notes`;--> statement-breakpoint
ALTER TABLE `chats` DROP COLUMN `last_notes`;--> statement-breakpoint
ALTER TABLE `chats` DROP COLUMN `last_memory`;--> statement-breakpoint
ALTER TABLE `chats` DROP COLUMN `memory`;
