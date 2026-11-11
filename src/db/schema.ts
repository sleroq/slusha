import {
    bigint,
    bigserial,
    boolean,
    date,
    index,
    jsonb,
    pgTable,
    primaryKey,
    text,
    timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
    id: bigint('id', { mode: 'number' }).primaryKey(),
    username: text('username'),
    firstName: text('first_name').notNull(),
    info: jsonb('info').notNull(),
    lastSeen: timestamp('last_seen', { withTimezone: true }),
});

export const chats = pgTable('chats', {
    id: bigint('id', { mode: 'number' }).primaryKey(),
    type: text('type').notNull(),
    info: jsonb('info').notNull(),
    sendBlocked: boolean('send_blocked').default(false).notNull(),
});

export const updates = pgTable('updates', {
    id: bigint('id', { mode: 'number' }).primaryKey(),
    payload: jsonb('payload').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow(),
    status: text('status').default('pending'),
});

export const events = pgTable(
    'events',
    {
        id: bigserial('id', { mode: 'number' }).primaryKey(),
        updateId: bigint('update_id', { mode: 'number' }).unique(),
        chatId: bigint('chat_id', { mode: 'number' }).notNull(),
        topicId: bigint('topic_id', { mode: 'number' }).default(0).notNull(),
        messageId: bigint('message_id', { mode: 'number' }),
        userId: bigint('user_id', { mode: 'number' }),
        kind: text('kind').notNull(),
        payload: jsonb('payload').notNull(),
        occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
        optedOut: boolean('opted_out').default(false).notNull(),
        released: boolean('released').default(false).notNull(),
    },
    (table) => [index('events_chat_topic_id_idx').on(table.chatId, table.topicId, table.id)],
);

export const conversations = pgTable(
    'conversations',
    {
        chatId: bigint('chat_id', { mode: 'number' }).notNull(),
        topicId: bigint('topic_id', { mode: 'number' }).default(0).notNull(),
        sessionId: text('session_id').notNull(),
        contextEventId: bigint('context_event_id', { mode: 'number' }).default(0).notNull(),
        generation: bigint('generation', { mode: 'number' }).default(0).notNull(),
        pendingRotation: boolean('pending_rotation').default(false).notNull(),
        pendingReset: bigint('pending_reset', { mode: 'number' }),
        pendingRunEventId: bigint('pending_run_event_id', { mode: 'number' }),
        accountedInput: bigint('accounted_input', { mode: 'number' }).default(0).notNull(),
        accountedOutput: bigint('accounted_output', { mode: 'number' }).default(0).notNull(),
        accountedCacheRead: bigint('accounted_cache_read', { mode: 'number' }).default(0).notNull(),
    },
    (table) => [primaryKey({ columns: [table.chatId, table.topicId] })],
);

export const settings = pgTable(
    'settings',
    {
        scope: text('scope').notNull(),
        scopeId: text('scope_id').notNull(),
        key: text('key').notNull(),
        value: jsonb('value').notNull(),
    },
    (table) => [primaryKey({ columns: [table.scope, table.scopeId, table.key] })],
);

export const optOuts = pgTable(
    'opt_outs',
    {
        chatId: bigint('chat_id', { mode: 'number' }).notNull(),
        userId: bigint('user_id', { mode: 'number' }).notNull(),
    },
    (table) => [primaryKey({ columns: [table.chatId, table.userId] })],
);

export const usage = pgTable(
    'usage',
    {
        accountType: text('account_type').notNull(),
        accountId: bigint('account_id', { mode: 'number' }).notNull(),
        weekStart: date('week_start').notNull(),
        inputTokens: bigint('input_tokens', { mode: 'number' }).default(0).notNull(),
        outputTokens: bigint('output_tokens', { mode: 'number' }).default(0).notNull(),
        cacheReadTokens: bigint('cache_read_tokens', { mode: 'number' }).default(0).notNull(),
    },
    (table) => [primaryKey({ columns: [table.accountType, table.accountId, table.weekStart] })],
);

export const summaries = pgTable(
    'summaries',
    {
        chatId: bigint('chat_id', { mode: 'number' }).notNull(),
        kind: text('kind').notNull(),
        content: text('content').notNull(),
    },
    (table) => [primaryKey({ columns: [table.chatId, table.kind] })],
);

export const chatMembers = pgTable(
    'chat_members',
    {
        chatId: bigint('chat_id', { mode: 'number' }).notNull(),
        userId: bigint('user_id', { mode: 'number' }).notNull(),
        lastSeen: timestamp('last_seen', { withTimezone: true }).defaultNow(),
    },
    (table) => [primaryKey({ columns: [table.chatId, table.userId] })],
);
