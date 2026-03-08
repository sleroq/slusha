ALTER TABLE `chat_messages` ADD `thread_id` text;
--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `thread_root_message_id` integer;
--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `thread_parent_message_id` integer;
--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `thread_source` text;
--> statement-breakpoint
UPDATE `chat_messages`
SET
    `thread_parent_message_id` = `reply_to_id`,
    `thread_root_message_id` = CASE
        WHEN `reply_to_id` IS NOT NULL THEN `reply_to_id`
        ELSE `message_id`
    END,
    `thread_id` = 'legacy:' || CAST(CASE
        WHEN `reply_to_id` IS NOT NULL THEN `reply_to_id`
        ELSE `message_id`
    END AS text),
    `thread_source` = CASE
        WHEN `reply_to_id` IS NOT NULL THEN 'legacy_reply'
        ELSE 'legacy_single'
    END
WHERE `thread_id` IS NULL;
--> statement-breakpoint
CREATE INDEX `chat_messages_chat_id_thread_id_message_id_idx`
ON `chat_messages` (`chat_id`, `thread_id`, `message_id`);
