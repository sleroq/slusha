import { SlushaContext } from '../setup-bot.ts';
import { Composer } from 'grammy';

const bot = new Composer<SlushaContext>();

bot.command('start', (ctx) => ctx.reply(ctx.t('start-msg')));

export default bot;
