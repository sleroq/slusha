import { parseArgs } from 'node:util';
import { createBackup, restoreBackup } from './index';

try {
    const { values, positionals } = parseArgs({
        args: Bun.argv.slice(2),
        allowPositionals: true,
        options: {
            'data-dir': { type: 'string' },
            'backup-dir': { type: 'string' },
            'backup-set': { type: 'string' },
            'yes-replace': { type: 'boolean' },
        },
    });
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || !values['data-dir'] || positionals.length !== 1)
        throw new Error('Set DATABASE_URL and provide backup|restore and --data-dir');
    if (positionals[0] === 'backup' && values['backup-dir']) {
        console.log(
            await createBackup({
                databaseUrl,
                dataDir: values['data-dir'],
                backupDir: values['backup-dir'],
            }),
        );
    } else if (positionals[0] === 'restore' && values['backup-set'] && values['yes-replace']) {
        await restoreBackup({
            databaseUrl,
            dataDir: values['data-dir'],
            backupSet: values['backup-set'],
            replace: true,
        });
        console.log('Restore complete');
    } else {
        throw new Error(
            'Backup requires --backup-dir; restore requires --backup-set and --yes-replace (stop the application first)',
        );
    }
} catch (error) {
    console.error(error instanceof Error ? error.message : 'Backup command failed');
    process.exitCode = 1;
}
