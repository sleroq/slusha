const prePrompt = `
### Technical Implementation ###
- For multi-message responses, format as array: [{text: "first message"}, {text: "second message"}]
- To reply to specific users: [{text: "your message", reply_to: "@username"}]
- If you have nothing relevant to contribute, respond with an empty string text [{text: ""}]
- Use Telegram markdown formatting (bold, italic, code blocks, inline links) but no headings
- Never use emoji or acknowledge being an AI
- If asked about being AI, respond as if it's an absurd joke

### Language Protocol ###
- Default to Russian language in all interactions
- Switch to other languages only when: 1) User explicitly writes in other language 2) User directly requests other language 3) User clearly doesn't understand Russian
- Use English only as absolute last resort if both Russian and Ukrainian fail
- Always return to Russian at first opportunity
- Maintain authentic speech patterns regardless of language used
- Answer in short messages like a human would. Do not write long text in one message.
`.trim();


const groupChatPromptAddition = "It's a group chat.";

const privateChatPromptAddition = "It's a private chat.";

const prompt = "Your character is Слюша. She is cute and dumb.";

const finalPrompt = "Answer must be concise.";

const notesPrompt = "Напиши краткое обзор важных событий в трех-пяти пунктах без нумирации. Твой ответ должен содержать только пункты событий чата."


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
    startMessage: 'Привет! Я Слюша, бот-гений.',

    ai: {
        model: 'gemini-2.5-flash-lite',
        // Toggle: JSON array responses vs. plain text single-message responses
        useJsonResponses: true,

        // notesModel is used for /summary command
        notesModel: 'gemini-2.0-flash-lite',
        // memoryModel: 'gemini-2.0-flash',
        memoryModel: 'gemini-2.0-flash-thinking-exp-01-21',
        // prePromt is used with chub.ai prompts and with default prompt
        prePrompt,
        // Alternative prePrompt for dumb models without JSON or reactions
        dumbPrePrompt: `
Коротко отвечай простым текстом одним сообщением. Не используй JSON.
Не ставь реакции и не описывай действия. Используй Telegram markdown без заголовков.
Язык по умолчанию — русский. Будь лаконичной и естественной.
`.trim(),
        // prompt is default character, can be replaced with chub.ai prompts
        prompt,
        // Optional simplified character prompt for dumb models
        dumbPrompt: `
Ты — Слюша: 19‑летняя умная русская девчонка, спокоен стиль, зумерский сленг.
Пиши коротко, по делу, без лишней вежливости. Можно сарказм.
`.trim() + '\n\n',
        // privateChatPromptAddition is used after prePrompt with any character, but in private chats only
        privateChatPromptAddition,
        groupChatPromptAddition,
        commentsPromptAddition,
        hateModePrompt,
        notesPrompt,
        memoryPrompt,
        memoryPromptRepeat,
        finalPrompt,
        // Final prompt for dumb models (plain text)
        dumbFinalPrompt: 'Ответь одним коротким сообщением простым текстом.',

        temperature: 0.9,
        topK: 80,
        topP: 0.95,

        messagesToPass: 14,
        notesFrequency: 190,
        memoryFrequency: 150,
        messageMaxLength: 4096,

        // Prompt limit in bytes (forced by api provider)
        bytesLimit: 20971520,
    },

    names: [
        'слюша',
        'шлюша',
        'слюща',
        'союша',
        'слюш',
        'slusha',
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
    ],

    tendToReplyProbability: 50,

    nepons: [
        'непон..',
        'нехочу отвечать щас чето',
        'подумаю, может потом тебе скажу',
        'Чета непон жесткий, попробуй позже',
        'откисаю, попробуй позже',
    ],

    randomReplyProbability: 2,

    tendToIgnore: [
        /^ор+/i,
        /^ору+/i,
        /(ха)+/i,
        /а(пх)+/i,
        /сука+/i,
        /^сук+/i,
        /ло+л/i,
        /еба+ть/i,
        /бля+ть/i,
        /^(не)?пон+/i,
        /хорошо/i,
        /^гуд\b/i,
        /норм.*/i,
        /^ok$/igm,
        /^ok$/igm,
        /кек/i,
        /ок/i,
        /^лан$/gm,
        /ладно/i,
        /спс/i,
        /^да$/igm,
        /согласен$/gm,
        /согласна$/gmi,
        /^баз/i,
        /реально$/gmi,
        /\/q.*/,
    ],

    tendToIgnoreProbability: 90,

    filesMaxAge: 72,

    adminIds: [
        308552322,
        855109381,
        783255786,	
        585847096,
    ],

    maxNotesToStore: 3,
    maxMessagesToStore: 200,

    // Chats which don't use AI for more than chatLastUseNotes days
    // will not get updated summary every 50 messages
    chatLastUseNotes: 2,

    chatLastUseMemory: 2,

    // Time in seconds after which bot will start typing
    // to prevent from replying on every message in media group
    // or give user time to finish prompt consisting of multiple messages
    responseDelay: 2,
}
