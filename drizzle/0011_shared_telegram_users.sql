CREATE TABLE `telegram_users` (
    `id` integer PRIMARY KEY NOT NULL,
    `username` text,
    `first_name` text NOT NULL,
    `info` text NOT NULL,
    `last_seen` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO `telegram_users` (`id`, `username`, `first_name`, `info`, `last_seen`)
SELECT m.`user_id`, m.`username`, m.`first_name`, m.`info`, m.`last_use`
FROM `chat_members` m
WHERE NOT EXISTS (
    SELECT 1 FROM `chat_members` newer
    WHERE newer.`user_id` = m.`user_id`
      AND (newer.`last_use` > m.`last_use`
        OR (newer.`last_use` = m.`last_use` AND newer.`chat_id` > m.`chat_id`))
);
--> statement-breakpoint
CREATE TABLE `chat_members_new` (
    `chat_id` integer NOT NULL,
    `user_id` integer NOT NULL,
    `last_use` integer DEFAULT 0 NOT NULL,
    PRIMARY KEY(`chat_id`, `user_id`),
    FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (`user_id`) REFERENCES `telegram_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `chat_members_new` (`chat_id`, `user_id`, `last_use`)
SELECT `chat_id`, `user_id`, `last_use` FROM `chat_members`;
--> statement-breakpoint
DROP TABLE `chat_members`;
--> statement-breakpoint
ALTER TABLE `chat_members_new` RENAME TO `chat_members`;
--> statement-breakpoint
CREATE INDEX `chat_members_chat_activity_idx` ON `chat_members` (`chat_id`, `last_use`);
--> statement-breakpoint
CREATE INDEX `chat_members_user_activity_idx` ON `chat_members` (`user_id`, `last_use`);
