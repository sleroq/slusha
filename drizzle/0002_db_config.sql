CREATE TABLE IF NOT EXISTS `global_config` (
    `id` integer PRIMARY KEY NOT NULL,
    `payload` text NOT NULL,
    `updated_by` integer,
    `updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_config_overrides` (
    `chat_id` integer PRIMARY KEY NOT NULL,
    `payload` text NOT NULL,
    `updated_by` integer,
    `updated_at` integer DEFAULT 0 NOT NULL,
    FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `chat_config_overrides` (`chat_id`, `payload`, `updated_at`)
SELECT `id`, '{}', CAST((julianday('now') - 2440587.5) * 86400000 AS integer)
FROM `chats`
WHERE `chat_model` IS NOT NULL OR `messages_to_pass` IS NOT NULL OR
    `random_reply_probability` IS NOT NULL
ON CONFLICT(`chat_id`) DO NOTHING;
--> statement-breakpoint
UPDATE `chat_config_overrides`
SET `payload` = json_set(
    `payload`,
    '$.ai.model',
    (SELECT `chat_model` FROM `chats` WHERE `chats`.`id` = `chat_config_overrides`.`chat_id`)
)
WHERE (SELECT `chat_model` FROM `chats` WHERE `chats`.`id` = `chat_config_overrides`.`chat_id`) IS NOT NULL;
--> statement-breakpoint
UPDATE `chat_config_overrides`
SET `payload` = json_set(
    `payload`,
    '$.ai.messagesToPass',
    (SELECT `messages_to_pass` FROM `chats` WHERE `chats`.`id` = `chat_config_overrides`.`chat_id`)
)
WHERE (SELECT `messages_to_pass` FROM `chats` WHERE `chats`.`id` = `chat_config_overrides`.`chat_id`) IS NOT NULL;
--> statement-breakpoint
UPDATE `chat_config_overrides`
SET `payload` = json_set(
    `payload`,
    '$.randomReplyProbability',
    (SELECT `random_reply_probability` FROM `chats` WHERE `chats`.`id` = `chat_config_overrides`.`chat_id`)
)
WHERE (SELECT `random_reply_probability` FROM `chats` WHERE `chats`.`id` = `chat_config_overrides`.`chat_id`) IS NOT NULL;
