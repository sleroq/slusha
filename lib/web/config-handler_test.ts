import { createClient } from '@libsql/client';
import { assert, assertEquals, assertRejects } from '@std/assert';
import { sign } from '@tma.js/init-data-node';
import {
    type ApiErrorResponse,
    apiErrorSchema,
    configResponseSchema,
    updateConfigSchema,
} from '../../shared/config-contract.ts';
import { CONFIG_CONTRACT_VERSION } from '../../shared/config-contract-version.ts';
import { createConfigHandler } from './config-handler.ts';

Deno.test('config handler validates, serializes, and commits atomically', async () => {
    const path = await Deno.makeTempFile({ suffix: '.sqlite' });
    Deno.env.set('DATABASE_URL', `file:${path}`);
    const client = createClient({ url: `file:${path}` });
    await client.batch([
        `CREATE TABLE user_roles (
            user_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            expires_at INTEGER,
            granted_by INTEGER,
            granted_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, role)
        )`,
        `CREATE TABLE chats (
            id INTEGER PRIMARY KEY,
            info TEXT NOT NULL,
            last_use INTEGER NOT NULL DEFAULT 0,
            hate_mode INTEGER
        )`,
        `CREATE TABLE chat_members (
            chat_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            last_use INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (chat_id, user_id)
        )`,
        `CREATE TABLE config_entries (
            scope_key TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            updated_by INTEGER,
            updated_at INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (scope_key, key)
        )`,
        `CREATE TABLE config_entry_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scope_key TEXT NOT NULL,
            key TEXT NOT NULL,
            old_value TEXT,
            new_value TEXT,
            action TEXT NOT NULL,
            updated_by INTEGER,
            updated_at INTEGER NOT NULL DEFAULT 0
        )`,
        `INSERT INTO user_roles (
            user_id, role, granted_at
        ) VALUES (1, 'bot_admin', 0)`,
        `INSERT INTO user_roles (
            user_id, role, granted_at
        ) VALUES (2, 'trusted_user', 0)`,
    ]);

    const token = '123456:test-token';
    const initData = sign(
        {
            user: {
                id: 1,
                first_name: 'Admin',
                is_bot: false,
                language_code: 'en',
            },
        },
        token,
        new Date(),
    );
    const handler = createConfigHandler(token);
    const headers = {
        authorization: `tma ${initData}`,
        'content-type': 'application/json',
    };
    const trustedInitData = sign(
        {
            user: {
                id: 2,
                first_name: 'Trusted',
                is_bot: false,
                language_code: 'en',
            },
        },
        token,
        new Date(),
    );
    const trustedHeaders = {
        authorization: `tma ${trustedInitData}`,
        'content-type': 'application/json',
    };

    try {
        const getResponse = await handler(
            new Request('http://localhost/api/config?scope=global', {
                headers,
            }),
        );
        assertEquals(getResponse.status, 200);
        assertEquals(getResponse.headers.get('cache-control'), 'no-store');
        const body = await getResponse.json();
        assertEquals(body.contractVersion, CONFIG_CONTRACT_VERSION);
        assert(Array.isArray(body.fields));
        const matchers = body.fields.find(
            (field: { key?: string }) => field.key === 'tendToIgnore',
        );
        assertEquals(matchers.kind, 'matcher-list');
        assert(
            matchers.value.some((item: { __regex?: string }) =>
                typeof item.__regex === 'string'
            ),
        );
        const model = body.fields.find(
            (field: { key?: string }) => field.key === 'ai.model',
        );
        assertEquals(model.kind, 'select');
        const availableModels = body.fields.find(
            (field: { key?: string }) => field.key === 'availableModels',
        );
        assertEquals(availableModels.kind, 'string-list');
        assertEquals(availableModels.writable, true);

        const trustedResponse = await handler(
            new Request('http://localhost/api/config?scope=global', {
                headers: trustedHeaders,
            }),
        );
        assertEquals(trustedResponse.status, 200);
        const trusted = await trustedResponse.json();
        assertEquals(trusted.scopes.includes('global'), true);
        assertEquals(
            trusted.fields.some((field: { key?: string }) =>
                field.key === 'ai.temperature'
            ),
            true,
        );
        assertEquals(
            trusted.fields.some((field: { key?: string }) =>
                field.key === 'ai.prePrompt'
            ),
            true,
        );
        assertEquals(
            trusted.fields.some((field: { key?: string }) =>
                field.key === 'availableModels'
            ),
            true,
        );

        const invalidBody = await handler(
            new Request('http://localhost/api/config', {
                method: 'PUT',
                headers,
                body: JSON.stringify({ scope: 'global', operations: [] }),
            }),
        );
        assertEquals(invalidBody.status, 400);
        assertEquals(
            apiErrorSchema.parse(await invalidBody.json()),
            {
                contractVersion: CONFIG_CONTRACT_VERSION,
                message: 'Invalid settings request',
            },
        );

        assertEquals(
            updateConfigSchema.safeParse({
                scope: 'global',
                operations: [{ key: 'locale' }],
            }).success,
            false,
        );
        const invalidShapeBodies = [
            {
                scope: 'global',
                operations: [{ key: 'locale' }],
            },
            {
                scope: 'global',
                operations: [{ key: 'locale', reset: true, value: 'en' }],
            },
            {
                scope: 'global',
                chatId: Number.MAX_SAFE_INTEGER + 1,
                operations: [{ key: 'locale', value: 'en' }],
            },
        ];
        for (const body of invalidShapeBodies) {
            const response = await handler(
                new Request('http://localhost/api/config', {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify(body),
                }),
            );
            assertEquals(response.status, 400);
        }

        const personalUpdate = await handler(
            new Request('http://localhost/api/config', {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    scope: 'personal',
                    operations: [{
                        key: 'profile.about',
                        value: 'I prefer concise answers.',
                    }],
                }),
            }),
        );
        assertEquals(personalUpdate.status, 200);
        const personalUpdateBody = configResponseSchema.parse(
            await personalUpdate.json(),
        );
        assertEquals(
            personalUpdateBody.contractVersion,
            CONFIG_CONTRACT_VERSION,
        );
        const personalResponse = await handler(
            new Request('http://localhost/api/config?scope=personal', {
                headers,
            }),
        );
        assertEquals(personalResponse.status, 200);
        const personal = configResponseSchema.parse(
            await personalResponse.json(),
        );
        assertEquals(personalUpdateBody, personal);
        assertEquals(personal.fields, [{
            key: 'profile.about',
            kind: 'text',
            multiline: true,
            maxLength: 4000,
            value: 'I prefer concise answers.',
            overridden: true,
            writable: true,
        }]);

        const partialBatch = await handler(
            new Request('http://localhost/api/config', {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    scope: 'global',
                    operations: [
                        { key: 'locale', value: 'en' },
                        { key: 'ai.temperature', value: 99 },
                    ],
                }),
            }),
        );
        assertEquals(partialBatch.status, 400);
        const partialError: ApiErrorResponse = apiErrorSchema.parse(
            await partialBatch.json(),
        );
        assertEquals(partialError.contractVersion, CONFIG_CONTRACT_VERSION);
        assertEquals(
            partialError.fieldErrors?.['ai.temperature'],
            'Invalid config value for ai.temperature',
        );
        assertEquals(
            (await client.execute(
                "SELECT * FROM config_entries WHERE scope_key = 'global'",
            )).rows,
            [],
        );

        const trustedPromptUpdate = await handler(
            new Request('http://localhost/api/config', {
                method: 'PUT',
                headers: trustedHeaders,
                body: JSON.stringify({
                    scope: 'global',
                    operations: [{ key: 'ai.prePrompt', value: 'Nope' }],
                }),
            }),
        );
        assertEquals(trustedPromptUpdate.status, 200);

        const trustedUpdate = await handler(
            new Request('http://localhost/api/config', {
                method: 'PUT',
                headers: trustedHeaders,
                body: JSON.stringify({
                    scope: 'global',
                    operations: [{ key: 'ai.temperature', value: 1 }],
                }),
            }),
        );
        assertEquals(trustedUpdate.status, 200);
        const trustedUpdateBody = configResponseSchema.parse(
            await trustedUpdate.json(),
        );
        assertEquals(
            trustedUpdateBody.contractVersion,
            CONFIG_CONTRACT_VERSION,
        );
        assertEquals(
            trustedUpdateBody.fields.find((field) =>
                field.key === 'ai.temperature'
            )?.value,
            1,
        );

        await client.execute({
            sql: 'INSERT INTO chats (id, info) VALUES (?, ?)',
            args: [1, JSON.stringify({ type: 'private', first_name: 'Admin' })],
        });
        for (
            const operation of [
                { key: 'ai.temperature', value: 1.25 },
                { key: 'ai.temperature', reset: true },
            ]
        ) {
            const chatUpdate = await handler(
                new Request('http://localhost/api/config', {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({
                        scope: 'private',
                        chatId: 1,
                        operations: [operation],
                    }),
                }),
            );
            assertEquals(chatUpdate.status, 200);
            const chat = configResponseSchema.parse(await chatUpdate.json());
            assertEquals(chat.scope, 'private');
            assertEquals(chat.chatId, 1);
            const temperature = chat.fields.find((field) =>
                field.key === 'ai.temperature'
            );
            assertEquals(temperature?.inheritedValue, 1);
            if ('reset' in operation) {
                assertEquals(temperature?.value, 1);
                assertEquals(temperature?.overridden, false);
            } else {
                assertEquals(temperature?.value, 1.25);
                assertEquals(temperature?.overridden, true);
            }
        }

        await client.execute('DROP TABLE chats');
        await assertRejects(() =>
            handler(
                new Request('http://localhost/api/config?scope=global', {
                    headers,
                }),
            )
        );
    } finally {
        client.close();
        await Deno.remove(path);
    }
});
