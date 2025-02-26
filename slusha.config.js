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
        model: 'gemini-2.0-flash',
        // prePromt is used with chub.ai prompts and with default prompt
        prePrompt,
        // prompt is default character, can be replaced with chub.ai prompts
        prompt,
        // privateChatPromptAddition is used after prePrompt with any character, but in private chats only
        privateChatPromptAddition,
        groupChatPromptAddition,
        notesPrompt,
        finalPrompt,
        temperature: 0.8,
        topK: 60,
        topP: 0.9,
        messagesToPass: 20,
        messageMaxLength: 4096,
        bytesLimit: 20971520,
    },

    names: [
        'слюша',
        'шлюша',
        'слюща',
        'союша',
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
        /\b(AI)\b/i,
    ],

    tendToReplyProbability: 50,

    nepons: [
        'непон..',
        'нехочу отвечать щас чето',
        'подумаю, может потом тебе скажу',
        'Чета непон жесткий, попробуй позже',
        'откисаю, попробуй позже',
    ],

    randomReplyProbability: 1,

    tendToIgnore: [
        /^ор+/,
        /^ору+/,
        /(ха)+/,
        /а(пх)+/,
        /сука+/,
        /^сук+/,
        /ло+л/,
        /еба+ть/,
        /бля+ть/,
        /^(не)?пон+/,
        'хорошо',
        /^гуд\b/,
        /норм.*/,
        /^ok$/gm,
        /^ok$/gm,
        'кек',
        /ок.*/,
        /^лан$/gm,
        'ладно',
        'спс',
        /^да$/gm,
        /согласен$/gm,
        /согласна$/gm,
        /^баз/,
        /реально$/gm,
        /\/q.*/,
    ],

    tendToIgnoreProbability: 90,

    filesMaxAge: 72,

    adminIds: [
        308552322,
        855109381,
    ],

    maxNotesToStore: 5,
    maxMessagesToStore: 100,

    // Chats which don't use AI for more than chatLastUseNotes days
    // will not get updated summary every 50 messages
    chatLastUseNotes: 2,

    // Time in seconds after which bot will start typing
    // to prevent from replying on every message in media group
    // or give user time to finish prompt consisting of multiple messages
    responseDelay: 2,

    // Drops pending messages if any when bot was down
    // When false, bot will try respond to all of them at once so may hit AI proveder rate limit
    dropPendingUpdates: false,
}
