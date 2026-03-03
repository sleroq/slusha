CREATE TABLE `chats` (
    `id` integer PRIMARY KEY NOT NULL,
    `info` text NOT NULL,
    `last_use` integer DEFAULT 0 NOT NULL,
    `last_notes` integer DEFAULT 0 NOT NULL,
    `last_memory` integer DEFAULT 0 NOT NULL,
    `memory` text,
    `chat_model` text,
    `messages_to_pass` integer,
    `random_reply_probability` real,
    `hate_mode` integer,
    `locale` text
);

CREATE TABLE `chat_notes` (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `chat_id` integer NOT NULL,
    `note_index` integer NOT NULL,
    `text` text NOT NULL,
    FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `chat_members` (
    `chat_id` integer NOT NULL,
    `user_id` integer NOT NULL,
    `username` text,
    `first_name` text NOT NULL,
    `description` text DEFAULT '' NOT NULL,
    `info` text NOT NULL,
    `last_use` integer DEFAULT 0 NOT NULL,
    PRIMARY KEY(`chat_id`, `user_id`),
    FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `chat_opt_out_users` (
    `chat_id` integer NOT NULL,
    `user_id` integer NOT NULL,
    `username` text,
    `first_name` text NOT NULL,
    PRIMARY KEY(`chat_id`, `user_id`),
    FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `chat_messages` (
    `chat_id` integer NOT NULL,
    `message_id` integer NOT NULL,
    `text` text NOT NULL,
    `is_myself` integer NOT NULL,
    `reply_to_id` integer,
    `reply_to_text` text,
    `reply_to_is_myself` integer,
    `reply_to_info` text,
    `info` text NOT NULL,
    PRIMARY KEY(`chat_id`, `message_id`),
    FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `message_reactions` (
    `chat_id` integer NOT NULL,
    `message_id` integer NOT NULL,
    `reaction_key` text NOT NULL,
    `type` text NOT NULL,
    `emoji` text,
    `custom_emoji_id` text,
    `count` integer DEFAULT 0 NOT NULL,
    PRIMARY KEY(`chat_id`, `message_id`, `reaction_key`),
    FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `message_reaction_users` (
    `chat_id` integer NOT NULL,
    `message_id` integer NOT NULL,
    `reaction_key` text NOT NULL,
    `user_id` integer NOT NULL,
    `username` text,
    `name` text NOT NULL,
    PRIMARY KEY(`chat_id`, `message_id`, `reaction_key`, `user_id`)
);

CREATE TABLE `chat_characters` (
    `chat_id` integer PRIMARY KEY NOT NULL,
    `payload` text NOT NULL,
    `names` text NOT NULL,
    FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `chat_messages_chat_id_idx` ON `chat_messages` (`chat_id`, `message_id`);
CREATE INDEX `chat_members_chat_id_last_use_idx` ON `chat_members` (`chat_id`, `last_use`);
CREATE INDEX `chat_notes_chat_id_note_index_idx` ON `chat_notes` (`chat_id`, `note_index`);
