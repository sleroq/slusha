import { defineConfig } from 'drizzle-kit';

const dbUrl = Deno.env.get('DATABASE_URL') ?? 'file:./slusha.sqlite';

export default defineConfig({
    out: './drizzle',
    schema: './lib/db/schema.ts',
    dialect: 'sqlite',
    dbCredentials: {
        url: dbUrl,
    },
    verbose: true,
    strict: true,
});
