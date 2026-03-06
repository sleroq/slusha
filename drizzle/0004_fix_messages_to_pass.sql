UPDATE `chat_config_overrides`
SET `payload` = json_set(
    `payload`,
    '$.ai.messagesToPass',
    CASE
        WHEN CAST(json_extract(`payload`, '$.ai.messagesToPass') AS integer) < 1 THEN 1
        WHEN CAST(json_extract(`payload`, '$.ai.messagesToPass') AS integer) > 100 THEN 100
        ELSE CAST(json_extract(`payload`, '$.ai.messagesToPass') AS integer)
    END
)
WHERE json_type(`payload`, '$.ai.messagesToPass') IN ('integer', 'real');
--> statement-breakpoint
UPDATE `chat_config_overrides`
SET `payload` = json_remove(`payload`, '$.ai.messagesToPass')
WHERE json_type(`payload`, '$.ai.messagesToPass') IS NOT NULL
    AND json_type(`payload`, '$.ai.messagesToPass') NOT IN ('integer', 'real');
