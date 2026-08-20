import { createClient, type Transaction } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.ts';
import logger from '../logger.ts';

const defaultDbUrl = 'file:./slusha.sqlite';
let singletonDb: ReturnType<typeof createDb>['db'] | undefined;
let singletonClient: ReturnType<typeof createDb>['client'] | undefined;
let initializeDbPromise: Promise<void> | undefined;

class DbQueue {
    private tail = Promise.resolve();

    async acquire(): Promise<() => void> {
        const previous = this.tail;
        let release!: () => void;
        const current = new Promise<void>((resolve) => {
            release = resolve;
        });
        this.tail = previous.then(() => current);
        await previous;
        return release;
    }

    async run<T>(operation: () => Promise<T>): Promise<T> {
        const release = await this.acquire();
        try {
            return await operation();
        } finally {
            release();
        }
    }
}

function serializeClient(client: ReturnType<typeof createClient>) {
    const queue = new DbQueue();
    const queuedMethods = new Set([
        'batch',
        'execute',
        'executeMultiple',
        'migrate',
    ]);

    return new Proxy(client, {
        get(target, property) {
            const value = Reflect.get(target, property, target);
            if (typeof value !== 'function') return value;

            if (queuedMethods.has(String(property))) {
                return (...args: unknown[]) =>
                    queue.run(() =>
                        Promise.resolve(Reflect.apply(value, target, args))
                    );
            }

            if (property === 'transaction') {
                return async (...args: unknown[]) => {
                    const releaseQueue = await queue.acquire();
                    let released = false;
                    const release = () => {
                        if (released) return;
                        released = true;
                        releaseQueue();
                    };

                    try {
                        const transaction = await Reflect.apply(
                            value,
                            target,
                            args,
                        ) as Transaction;
                        return new Proxy(transaction, {
                            get(transactionTarget, transactionProperty) {
                                const transactionValue = Reflect.get(
                                    transactionTarget,
                                    transactionProperty,
                                    transactionTarget,
                                );
                                if (typeof transactionValue !== 'function') {
                                    return transactionValue;
                                }

                                if (
                                    transactionProperty === 'commit' ||
                                    transactionProperty === 'rollback'
                                ) {
                                    return async (
                                        ...transactionArgs: unknown[]
                                    ) => {
                                        try {
                                            return await Reflect.apply(
                                                transactionValue,
                                                transactionTarget,
                                                transactionArgs,
                                            );
                                        } finally {
                                            release();
                                        }
                                    };
                                }

                                if (transactionProperty === 'close') {
                                    return (...transactionArgs: unknown[]) => {
                                        try {
                                            return Reflect.apply(
                                                transactionValue,
                                                transactionTarget,
                                                transactionArgs,
                                            );
                                        } finally {
                                            release();
                                        }
                                    };
                                }

                                return transactionValue.bind(transactionTarget);
                            },
                        });
                    } catch (error) {
                        release();
                        throw error;
                    }
                };
            }

            return value.bind(target);
        },
    });
}

export function resolveDbUrl(): string {
    return Deno.env.get('DATABASE_URL') ?? defaultDbUrl;
}

export function createDb(url = resolveDbUrl()) {
    const client = serializeClient(createClient({
        url,
        timeout: 5000,
    }));

    const db = drizzle({ client, schema });

    return { db, client };
}

function ensureDbCreated() {
    if (!singletonClient) {
        const created = createDb();
        singletonDb = created.db;
        singletonClient = created.client;
    }
}

export async function initializeDb() {
    if (!initializeDbPromise) {
        initializeDbPromise = (async () => {
            ensureDbCreated();

            try {
                await singletonClient!.execute('PRAGMA foreign_keys = ON;');
                await singletonClient!.execute('PRAGMA journal_mode = WAL;');
                await singletonClient!.execute('PRAGMA busy_timeout = 5000;');
            } catch (error) {
                logger.warn('Could not apply SQLite pragmas: ', error);
            }
        })();
    }

    await initializeDbPromise;
}

export function getDb() {
    ensureDbCreated();

    return singletonDb!;
}

export type DbClient = ReturnType<typeof createDb>['db'];
