import { createClient } from '@libsql/client';
import { assert, assertEquals, assertRejects } from '@std/assert';
import { drizzle } from 'drizzle-orm/libsql';
import { ConfigValidationError, getGlobalUserConfig } from './config.ts';
import {
    type ConfigTarget,
    ConfigurationService,
} from './configuration-service.ts';
import * as schema from './db/schema.ts';

async function createTestDb() {
    const path = await Deno.makeTempFile({ suffix: '.sqlite' });
    const client = createClient({ url: `file:${path}` });
    await client.execute(`
        CREATE TABLE config_entries (
            scope_key TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            updated_by INTEGER,
            updated_at INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (scope_key, key)
        )
    `);
    await client.execute(`
        CREATE TABLE config_entry_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scope_key TEXT NOT NULL,
            key TEXT NOT NULL,
            old_value TEXT,
            new_value TEXT,
            action TEXT NOT NULL,
            updated_by INTEGER,
            updated_at INTEGER NOT NULL DEFAULT 0
        )
    `);
    return { client, db: drizzle({ client, schema }), path };
}

const globalTarget: ConfigTarget = { scope: 'global' };

Deno.test('configuration editor returns authorized JSON-safe metadata', async () => {
    const { client, db, path } = await createTestDb();
    try {
        const admin = new ConfigurationService(
            db,
            1,
            { globalRoles: new Set(['bot_admin']) },
        );
        const adminFields = await admin.listReadable(globalTarget);
        const matchers = adminFields.find((field) =>
            field.key === 'tendToIgnore'
        );
        assertEquals(matchers?.kind, 'matcher-list');
        assert(Array.isArray(matchers?.value));
        assertEquals(
            matchers.value.some((item) =>
                typeof item === 'object' && typeof item.__regex === 'string'
            ),
            true,
        );
        const adminModel = adminFields.find((field) =>
            field.key === 'ai.model'
        );
        assertEquals(adminModel?.kind, 'select');
        const temperature = adminFields.find((field) =>
            field.key === 'ai.temperature'
        );
        assertEquals(temperature?.kind, 'range');
        if (temperature?.kind === 'range') {
            assertEquals(
                {
                    min: temperature.min,
                    max: temperature.max,
                    step: temperature.step,
                },
                { min: 0, max: 2, step: 0.01 },
            );
        }

        const trusted = new ConfigurationService(
            db,
            2,
            { globalRoles: new Set(['trusted_user']) },
        );
        const trustedFields = await trusted.listReadable(globalTarget);
        const trustedModel = trustedFields.find((field) =>
            field.key === 'ai.model'
        );
        assertEquals(trustedModel?.kind, 'text');
        assertEquals(
            trustedFields.some((field) => field.key === 'availableModels'),
            false,
        );
    } finally {
        client.close();
        await Deno.remove(path);
    }
});

Deno.test('configuration batches validate before committing', async () => {
    const { client, db, path } = await createTestDb();
    try {
        const service = new ConfigurationService(
            db,
            1,
            { globalRoles: new Set(['bot_admin']) },
        );
        await assertRejects(
            () =>
                service.applyOperations(globalTarget, [
                    { key: 'locale', value: 'en' },
                    { key: 'ai.temperature', value: 99 },
                ]),
            ConfigValidationError,
        );
        assertEquals(
            await db.query.configEntries.findMany(),
            [],
        );

        await service.applyOperations(globalTarget, [
            { key: 'locale', value: 'en' },
            { key: 'ai.temperature', value: 1 },
        ]);
        assertEquals((await db.query.configEntries.findMany()).length, 2);
        assertEquals((await db.query.configEntryHistory.findMany()).length, 2);
    } finally {
        client.close();
        await Deno.remove(path);
    }
});

Deno.test('configuration matcher payloads round-trip through writes', async () => {
    const { client, db, path } = await createTestDb();
    try {
        const service = new ConfigurationService(
            db,
            1,
            { globalRoles: new Set(['bot_admin']) },
        );
        const fields = await service.listReadable(globalTarget);
        const matchers = fields.find((field) => field.key === 'tendToIgnore');
        assert(Array.isArray(matchers?.value));

        await service.applyOperations(globalTarget, [{
            key: 'tendToIgnore',
            value: matchers.value,
        }]);

        const row = await db.query.configEntries.findFirst();
        const stored = JSON.parse(row?.value ?? 'null');
        assert(
            stored.some((item: unknown) =>
                typeof item === 'object' && item !== null &&
                '__regex' in item
            ),
        );
        const config = await getGlobalUserConfig(db);
        assert(config.tendToIgnore.some((item) => item instanceof RegExp));
    } finally {
        client.close();
        await Deno.remove(path);
    }
});
