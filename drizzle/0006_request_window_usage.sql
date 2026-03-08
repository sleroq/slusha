CREATE TABLE `request_window_events` (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `chat_id` integer NOT NULL,
    `user_id` integer,
    `created_at` integer NOT NULL
);

CREATE INDEX `request_window_events_chat_time_idx`
ON `request_window_events` (`chat_id`, `created_at`);

CREATE INDEX `request_window_events_user_time_idx`
ON `request_window_events` (`user_id`, `created_at`);
