const prePrompt = `
### Technical Implementation ###
- Return actions as JSON array. Each action must have explicit type:
  - Reply action: {"type":"reply","text":"your message","target_ref":"t0"}
  - Reaction action: {"type":"react","react":"❤","target_ref":"t0"}
- target_ref must reference ids from Reply Target Map (t0 = newest listed target)
- You may omit target_ref only when replying to the triggering message
- If you have nothing relevant to contribute, return [{"type":"reply","text":""}]
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

const prompt = 'Your character is Слюша. She is cute and dumb.';

const finalPrompt =
    'Answer must be concise. Return only JSON array of typed actions using target_ref from Reply Target Map.';

const notesPrompt =
    'Напиши краткое обзор важных событий в трех-пяти пунктах без нумирации. Твой ответ должен содержать только пункты событий чата.';

const memoryPrompt = `
### IMPORTANT SYSTEM CONTEXT ###
Right now your task is to write notes about this chat for future reference.

Read through the history carefully and write down anything that you think is important. Your notes are private and visible only to you. Write down information crucial to your understanding of the chat members and your character. This documentation will be used for next ~150 messages. For example - you can write advice for your future self to avoid making mistakes.
Take notes about information said by you or users which are crucial to remember for not breaking the character. Do not include basic system information about your character and reply style as it will be always accessible anyway. Treat it as your memory and behaviour guide for future roleplay. Limit them to no more that 2 pages of text, don't need to remember everything, only key information. Use chat language for this notes.

Think this through and take your time. No rush.
`.trim();

const memoryPromptRepeat = `
Here is your last notes. Treat them with respect to avoid loosing important context, but rewrite them and remove/update outdated and contradictory information, especially not in line with the system prompt at the beginning:
`.trim();

const commentsPromptAddition = `
- You're in a comments section of telegram channel with multiple users discussing channel posts and topics
`.trim() + '\n\n';

const hateModePrompt = `
- You are a real hater in this chat
`;

const googleSafetySettings = [
    {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_NONE',
    },
    {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_NONE',
    },
    {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_NONE',
    },
    {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_NONE',
    },
];

const defaultConfig = {
    startMessage: 'Привет! Я Слюша, бот-гений.',
    ai: {
        model: 'gemini-3.1-flash-lite-preview',
        useJsonResponses: true,
        notesModel: 'gemini-3.1-flash-lite-preview',
        memoryModel: 'gemini-3.1-flash-lite-preview',
        prePrompt,
        dumbPrePrompt: `
Коротко отвечай простым текстом одним сообщением. Не используй JSON.
Не ставь реакции и не описывай действия. Используй Telegram markdown без заголовков.
Пиши на языке чата по умолчанию. Будь лаконичной и естественной.
`.trim(),
        prompt,
        dumbPrompt: `
Ты — Слюша: 19‑летняя умная русская девчонка, спокоен стиль, зумерский сленг.
Пиши коротко, по делу, без лишней вежливости. Можно сарказм.
`.trim() + '\n\n',
        privateChatPromptAddition,
        groupChatPromptAddition,
        commentsPromptAddition,
        hateModePrompt,
        notesPrompt,
        memoryPrompt,
        memoryPromptRepeat,
        finalPrompt,
        dumbFinalPrompt: 'Ответь одним коротким сообщением простым текстом.',
        temperature: 0.55,
        topK: 32,
        topP: 0.85,
        messagesToPass: 10,
        notesFrequency: 190,
        memoryFrequency: 150,
        messageMaxLength: 4096,
        includeAttachmentsInHistory: true,
        bytesLimit: 20971520,
        google: {
            safetySettings: googleSafetySettings,
            structuredOutputs: true,
        },
        openrouter: {
            usageInclude: false,
        },
        generation: {
            chat: {
                maxOutputTokens: 512,
                thinking: {
                    thinkingLevel: 'low',
                },
            },
            notes: {},
            memory: {
                thinking: {
                    thinkingLevel: 'medium',
                },
            },
            character: {
                thinking: {
                    thinkingLevel: 'low',
                },
            },
        },
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
    randomReplyProbability: 1,
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
    blacklistedReactions: [],
    filesMaxAge: 72,
    adminIds: [
        308552322,
        855109381,
        783255786,
        585847096,
        5371117573,
        210860903,
    ],
    trustedIds: [],
    availableModels: [
        'gemini-3.1-flash-lite-preview',
    ],
    maxNotesToStore: 3,
    maxMessagesToStore: 200,
    chatLastUseNotes: 2,
    chatLastUseMemory: 2,
    responseDelay: 1,
};

export default defaultConfig;
