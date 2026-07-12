CREATE TABLE `user_roles` (
    `user_id` integer NOT NULL,
    `role` text NOT NULL,
    `expires_at` integer,
    `granted_by` integer,
    `granted_at` integer NOT NULL,
    PRIMARY KEY(`user_id`, `role`)
);
--> statement-breakpoint
CREATE TABLE `user_role_history` (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `user_id` integer NOT NULL,
    `role` text NOT NULL,
    `action` text NOT NULL,
    `changed_by` integer,
    `changed_at` integer NOT NULL,
    `expires_at` integer
);
--> statement-breakpoint
INSERT INTO `user_roles` (`user_id`, `role`, `granted_at`)
SELECT CAST(`value` AS integer), 'bot_admin', unixepoch() * 1000
FROM json_each((
    SELECT `value` FROM `config_entries`
    WHERE `scope_key` = 'global' AND `key` = 'adminIds'
))
WHERE json_type(`value`) = 'integer';
--> statement-breakpoint
INSERT INTO `user_roles` (`user_id`, `role`, `granted_at`)
SELECT CAST(`value` AS integer), 'trusted_user', unixepoch() * 1000
FROM json_each((
    SELECT `value` FROM `config_entries`
    WHERE `scope_key` = 'global' AND `key` = 'trustedIds'
))
WHERE json_type(`value`) = 'integer';
--> statement-breakpoint
INSERT INTO `user_roles` (`user_id`, `role`, `granted_at`)
SELECT `user_id`, 'bot_admin', unixepoch() * 1000 FROM (
    SELECT 308552322 AS `user_id`
    UNION ALL SELECT 855109381
    UNION ALL SELECT 783255786
    UNION ALL SELECT 585847096
    UNION ALL SELECT 5371117573
    UNION ALL SELECT 210860903
)
WHERE NOT EXISTS (
    SELECT 1 FROM `config_entries`
    WHERE `scope_key` = 'global' AND `key` = 'adminIds'
);
--> statement-breakpoint
INSERT INTO `user_role_history`
    (`user_id`, `role`, `action`, `changed_at`)
SELECT `user_id`, `role`, 'grant', `granted_at` FROM `user_roles`;
--> statement-breakpoint
DELETE FROM `config_entries`
WHERE `scope_key` = 'global' AND `key` IN ('adminIds', 'trustedIds');
