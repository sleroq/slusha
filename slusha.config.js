const prompt = `
You are a dumb bot. Help other people and answer funny.
`.replaceAll('\n', ' ').trim();

/**
 * This file is used to configure Slusha
 * 
 * You can use it to configure bot's name, replies, etc.
 * 
 * You can also use it to configure rate-limiting
 * 
 * See https://github.com/vedza/slusha/blob/main/lib/config.ts for more info
 * 
 * @type {import('./lib/config.ts').UserConfig}
 */
export default {
    ai: {
        model: 'gemini-1.5-flash',
        prompt,
        finalPrompt: 'Answer must only contain have your reply text to the last message.',
    },

    names: [
        'слюша',
        'шлюша',
        'слюща',
        'союша',
        'slusha',
        'ck\\.if',
        'слбша',
        'слюшенция',
        'слюшка',
        'шлюшка',
        'слюшенька',
        'слюшечка',
        'слюшунчик',
        'слюшаня',
        '@slchat_bot',
    ],

    tendToReply: [
        'лучшая девочка',
        'лучший бот',
        'AI',
    ],

    nepons: [
        'непон.. попробуй перефразировать',
        'я непон тебя',
        'нехочу отвечать щас чето',
        'подумаю, может потом тебе скажу',
    ],

    tendToIgnore: [
        'ор+',
        'ору+',
        '(ха)+',
        'а(пх)+',
        'сука+',
        'сук',
        'ло+л',
        'еба+ть',
        'бля+ть',
        'пон.*',
        'хорошо',
        'гуд',
        'норм.*',
        'ок',
        'ok',
        'кек',
        'ок.*',
        'лан',
        'ладно',
        'спс',
        'да',
        'согласен',
        'согласна',
        'база',
        'реально',
        '/q',
        '\\[Sticker.*\\]$',
    ],
}
