import { SlushaContext } from '../setup-bot.ts';
import { Composer } from 'grammy';
import { Config } from '../../config.ts';

export function registerSummary(
    composer: Composer<SlushaContext>,
    config: Config,
) {
    composer.command('summary', (ctx) => {
        ctx.m.getChat().lastUse = Date.now();
        const notes = ctx.m.getChat().notes.slice(-config.maxNotesToStore - 2);

        if (notes.length === 0) {
            return ctx.reply(ctx.t('notes-too-few-messages'));
        }

        return ctx.reply(
            ctx.t('notes-output', {
                notes: notes.join('\n').replaceAll('\n\n', '\n'),
            }),
        );
    });
}
