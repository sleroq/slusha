import { eq } from 'drizzle-orm';
import { InlineKeyboard, type Api } from 'grammy';
import type { CallbackQuery, InlineQuery, InlineQueryResultArticle } from 'grammy/types';
import { pageSize, type Characters } from '../characters';
import type { Db } from '../db/client';
import { chats } from '../db/schema';

export function callbackChatId(data: string | undefined) {
    const match = /^set (-?\d+) (?:default|\d+)$/.exec(data ?? '');
    if (!match) return undefined;
    const id = Number(match[1]);
    if (!Number.isSafeInteger(id) || id === 0) return undefined;
    return id;
}

function searchButton(chatId: number, query = '') {
    return `@${chatId} ${query}`.slice(0, 256);
}

function keyboard(chatId: number, selectedId?: number) {
    const result = new InlineKeyboard().switchInlineCurrent('Search', searchButton(chatId));
    if (selectedId !== undefined) result.text('Return to default', `set ${chatId} default`);
    return result;
}

export function createCharacterHandler({ db, api, characters, adminIds }: { db: Db; api: Api; characters?: Characters; adminIds: readonly number[] }) {
    async function current(chatId: number) {
        if (!characters) return api.sendMessage(chatId, 'Character selection is unavailable.');
        const selected = await characters.get(chatId);
        return api.sendMessage(chatId, `Character: ${selected?.name.slice(0, 4000) ?? 'Слюша'}\nSearch Chub.ai for a character.`, { reply_markup: keyboard(chatId, selected?.id) });
    }

    async function inline(query: InlineQuery) {
        const words = query.query.trim().split(/\s+/);
        const match = /^@(-?\d+)$/.exec(words.shift() ?? '');
        const chatId = Number(match?.[1]);

        function article(id: string, title: string, text: string): InlineQueryResultArticle {
            return { type: 'article', id, title, input_message_content: { message_text: text } };
        }
        if (!match || !Number.isSafeInteger(chatId) || chatId === 0 || !characters) {
            await api.answerInlineQuery(query.id, [article('help', 'Open character search from a chat', 'Use /character to search.')], { cache_time: 0, is_personal: true });
            return;
        }

        let page = 1;
        let excludeNsfw = true;
        const terms: string[] = [];
        for (let i = 0; i < words.length; i++) {
            if (words[i]?.toLowerCase() === '/nsfw') excludeNsfw = false;
            else if (words[i] === '/p') {
                const value = Number(words[i + 1]);
                if (Number.isSafeInteger(value) && value > 0) { page = value; i++; }
            } else if (words[i]) terms.push(words[i]!);
        }

        const search = terms.join(' ');
        const header = article('header', 'Search Chub.ai', 'Search Chub.ai characters. Add /nsfw to include NSFW results.');
        header.description = 'Add /nsfw to include NSFW results';
        header.reply_markup = new InlineKeyboard().switchInlineCurrent('Search', searchButton(chatId, search));
        let results: Awaited<ReturnType<Characters['search']>>;
        try {
            results = await characters.search(search, page, excludeNsfw);
        } catch {
            const error = article('error', 'Search failed', 'Could not search Chub.ai.');
            error.reply_markup = keyboard(chatId);
            await api.answerInlineQuery(query.id, [error], { cache_time: 0, is_personal: true });
            return;
        }

        const cards: InlineQueryResultArticle[] = [header];
        for (const character of results) {
            const link = `https://venus.chub.ai/characters/${character.path.split('/').map(encodeURIComponent).join('/')}`;
            const text = `${character.name}\n\n${character.description.slice(0, 3000)}\n\n${character.topics.join(', ').slice(0, 500)}\n${character.stars} ⭐\n${link}`.slice(0, 4096);
            const card = article(String(character.id), character.name.slice(0, 256), text);
            card.description = character.description.slice(0, 256);
            if (/^https:\/\//i.test(character.avatar)) card.thumbnail_url = character.avatar;
            const data = `set ${chatId} ${character.id}`;
            const actions = keyboard(chatId);
            if (new TextEncoder().encode(data).length <= 64) actions.text('Set character', data);
            card.reply_markup = actions;
            cards.push(card);
        }

        if (!results.length) cards.push(article('empty', 'No characters found', 'Try a different search.'));
        if (results.length === pageSize) {
            let next = `/p ${page + 1} `;
            if (!excludeNsfw) next += '/nsfw ';
            next += search;
            const more = article('next', 'Next page', 'Continue searching Chub.ai.');
            more.reply_markup = new InlineKeyboard().switchInlineCurrent('Next page', searchButton(chatId, next));
            cards.push(more);
        }
        await api.answerInlineQuery(query.id, cards, { cache_time: 0, is_personal: true });
    }

    async function callback(query: CallbackQuery) {
        let answer = 'Invalid character action.';
        try {
            const chatId = callbackChatId(query.data);
            const value = query.data?.split(' ')[2];
            if (chatId !== undefined && value && characters) {
                const [chat] = await db.select({ type: chats.type }).from(chats).where(eq(chats.id, chatId)).limit(1);
                let authorized = false;
                if (chat && adminIds.includes(query.from.id)) authorized = true;
                else if (chat?.type === 'private') authorized = query.from.id === chatId;
                else if (chat && (chat.type === 'group' || chat.type === 'supergroup')) {
                    const member = await api.getChatMember(chatId, query.from.id);
                    authorized = member.status === 'creator' || member.status === 'administrator';
                }
                if (!chat) answer = 'Chat not found.';
                else if (!authorized) answer = 'Only chat administrators can change the character.';
                else {
                    const previous = await characters.get(chatId);
                    if (value === 'default') {
                        await characters.clear(chatId);
                        const actions = keyboard(chatId);
                        if (previous) actions.text(`Restore ${previous.name}`.slice(0, 64), `set ${chatId} ${previous.id}`);
                        answer = 'Default character selected.';
                        await api.sendMessage(chatId, `${query.from.first_name} restored the default character.`, { reply_markup: actions });
                    } else {
                        const id = Number(value);
                        if (Number.isSafeInteger(id) && id > 0) {
                            const selected = await characters.select(chatId, id, query.from.id);
                            answer = `Character selected: ${selected.name}`.slice(0, 200);
                            await api.sendMessage(chatId, `${query.from.first_name} selected ${selected.name}.`.slice(0, 4096), { reply_markup: keyboard(chatId, selected.id) });
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Character action failed', error);
            answer = 'Could not change the character.';
        }
        await api.answerCallbackQuery(query.id, { text: answer });
    }

    return { current, inline, callback };
}
