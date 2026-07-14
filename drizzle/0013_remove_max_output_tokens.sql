DELETE FROM `config_entries`
WHERE `key` IN (
    'ai.generation.chat.maxOutputTokens',
    'ai.generation.character.maxOutputTokens'
);
