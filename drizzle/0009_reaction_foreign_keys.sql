ALTER TABLE `message_reaction_users` RENAME TO `message_reaction_users_old`;
--> statement-breakpoint
ALTER TABLE `message_reactions` RENAME TO `message_reactions_old`;
--> statement-breakpoint
CREATE TABLE `message_reactions` (
    `chat_id` integer NOT NULL,
    `message_id` integer NOT NULL,
    `reaction_key` text NOT NULL,
    `type` text NOT NULL,
    `emoji` text,
    `custom_emoji_id` text,
    `count` integer DEFAULT 0 NOT NULL,
    PRIMARY KEY(`chat_id`, `message_id`, `reaction_key`),
    FOREIGN KEY (`chat_id`, `message_id`) REFERENCES `chat_messages`(`chat_id`, `message_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `message_reaction_users` (
    `chat_id` integer NOT NULL,
    `message_id` integer NOT NULL,
    `reaction_key` text NOT NULL,
    `user_id` integer NOT NULL,
    `username` text,
    `name` text NOT NULL,
    PRIMARY KEY(`chat_id`, `message_id`, `reaction_key`, `user_id`),
    FOREIGN KEY (`chat_id`, `message_id`, `reaction_key`) REFERENCES `message_reactions`(`chat_id`, `message_id`, `reaction_key`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `message_reactions` (
    `chat_id`,
    `message_id`,
    `reaction_key`,
    `type`,
    `emoji`,
    `custom_emoji_id`,
    `count`
)
SELECT
    r.`chat_id`,
    r.`message_id`,
    r.`reaction_key`,
    r.`type`,
    r.`emoji`,
    r.`custom_emoji_id`,
    r.`count`
FROM `message_reactions_old` r
INNER JOIN `chat_messages` m
    ON m.`chat_id` = r.`chat_id`
    AND m.`message_id` = r.`message_id`;
--> statement-breakpoint
INSERT INTO `message_reaction_users` (
    `chat_id`,
    `message_id`,
    `reaction_key`,
    `user_id`,
    `username`,
    `name`
)
SELECT
    u.`chat_id`,
    u.`message_id`,
    u.`reaction_key`,
    u.`user_id`,
    u.`username`,
    u.`name`
FROM `message_reaction_users_old` u
INNER JOIN `message_reactions` r
    ON r.`chat_id` = u.`chat_id`
    AND r.`message_id` = u.`message_id`
    AND r.`reaction_key` = u.`reaction_key`;
--> statement-breakpoint
DROP TABLE `message_reaction_users_old`;
--> statement-breakpoint
DROP TABLE `message_reactions_old`;
