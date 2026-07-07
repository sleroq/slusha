import {
    foreignKey,
    integer,
    primaryKey,
    sqliteTable,
    text,
} from 'drizzle-orm/sqlite-core';

export const chats = sqliteTable('chats', {
    id: integer('id', { mode: 'number' }).primaryKey(),
    info: text('info').notNull(),
    lastUse: integer('last_use', { mode: 'number' }).notNull().default(0),
    hateMode: integer('hate_mode', { mode: 'boolean' }),
});

export const configEntries = sqliteTable('config_entries', {
    scopeKey: text('scope_key').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(),
    updatedBy: integer('updated_by', { mode: 'number' }),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull().default(0),
}, (table) => [
    primaryKey({ columns: [table.scopeKey, table.key] }),
]);

export const configEntryHistory = sqliteTable('config_entry_history', {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    scopeKey: text('scope_key').notNull(),
    key: text('key').notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    action: text('action', { enum: ['set', 'reset'] }).notNull(),
    updatedBy: integer('updated_by', { mode: 'number' }),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull().default(0),
});

export const chatMembers = sqliteTable('chat_members', {
    chatId: integer('chat_id', { mode: 'number' }).notNull().references(
        () => chats.id,
        { onDelete: 'cascade' },
    ),
    userId: integer('user_id', { mode: 'number' }).notNull(),
    username: text('username'),
    firstName: text('first_name').notNull(),
    description: text('description').notNull().default(''),
    info: text('info').notNull(),
    lastUse: integer('last_use', { mode: 'number' }).notNull().default(0),
}, (table) => [
    primaryKey({ columns: [table.chatId, table.userId] }),
]);

export const chatOptOutUsers = sqliteTable('chat_opt_out_users', {
    chatId: integer('chat_id', { mode: 'number' }).notNull().references(
        () => chats.id,
        { onDelete: 'cascade' },
    ),
    userId: integer('user_id', { mode: 'number' }).notNull(),
    username: text('username'),
    firstName: text('first_name').notNull(),
}, (table) => [
    primaryKey({ columns: [table.chatId, table.userId] }),
]);

export const chatMessages = sqliteTable('chat_messages', {
    chatId: integer('chat_id', { mode: 'number' }).notNull().references(
        () => chats.id,
        { onDelete: 'cascade' },
    ),
    messageId: integer('message_id', { mode: 'number' }).notNull(),
    text: text('text').notNull(),
    isMyself: integer('is_myself', { mode: 'boolean' }).notNull(),
    replyToId: integer('reply_to_id', { mode: 'number' }),
    replyToText: text('reply_to_text'),
    replyToIsMyself: integer('reply_to_is_myself', { mode: 'boolean' }),
    replyToInfo: text('reply_to_info'),
    threadId: text('thread_id'),
    threadRootMessageId: integer('thread_root_message_id', { mode: 'number' }),
    threadParentMessageId: integer('thread_parent_message_id', {
        mode: 'number',
    }),
    threadSource: text('thread_source'),
    info: text('info').notNull(),
}, (table) => [
    primaryKey({ columns: [table.chatId, table.messageId] }),
]);

export const messageReactions = sqliteTable('message_reactions', {
    chatId: integer('chat_id', { mode: 'number' }).notNull(),
    messageId: integer('message_id', { mode: 'number' }).notNull(),
    reactionKey: text('reaction_key').notNull(),
    type: text('type', { enum: ['emoji', 'custom'] }).notNull(),
    emoji: text('emoji'),
    customEmojiId: text('custom_emoji_id'),
    count: integer('count', { mode: 'number' }).notNull().default(0),
}, (table) => [
    primaryKey({
        columns: [table.chatId, table.messageId, table.reactionKey],
    }),
    foreignKey({
        columns: [table.chatId, table.messageId],
        foreignColumns: [chatMessages.chatId, chatMessages.messageId],
    }).onDelete('cascade'),
]);

export const messageReactionUsers = sqliteTable('message_reaction_users', {
    chatId: integer('chat_id', { mode: 'number' }).notNull(),
    messageId: integer('message_id', { mode: 'number' }).notNull(),
    reactionKey: text('reaction_key').notNull(),
    userId: integer('user_id', { mode: 'number' }).notNull(),
    username: text('username'),
    name: text('name').notNull(),
}, (table) => [
    primaryKey({
        columns: [
            table.chatId,
            table.messageId,
            table.reactionKey,
            table.userId,
        ],
    }),
    foreignKey({
        columns: [table.chatId, table.messageId, table.reactionKey],
        foreignColumns: [
            messageReactions.chatId,
            messageReactions.messageId,
            messageReactions.reactionKey,
        ],
    }).onDelete('cascade'),
]);

export const chatCharacters = sqliteTable('chat_characters', {
    chatId: integer('chat_id', { mode: 'number' }).primaryKey().references(
        () => chats.id,
        { onDelete: 'cascade' },
    ),
    payload: text('payload').notNull(),
    names: text('names').notNull(),
});
