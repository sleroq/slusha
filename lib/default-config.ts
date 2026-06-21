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

const chatActionsToolDescription =
    'Submit Telegram actions once per turn. Return entries where each item is either {"type":"reply","text":"...","target_ref":"tN"} or {"type":"react","react":"❤","target_ref":"tN"}. Use target_ref values from Reply Target Map. If target_ref is omitted, action applies to the triggering message.';

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
        prePrompt,
        prompt,
        privateChatPromptAddition,
        groupChatPromptAddition,
        commentsPromptAddition,
        hateModePrompt,
        finalPrompt,
        chatActionsToolDescription,
        temperature: 0.55,
        topK: 32,
        topP: 0.85,
        messagesToPass: 10,
        messageMaxLength: 4096,
        reservedMessageTokens: [
            'slusha_meta',
            'target_ref',
        ],
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
    maxMessagesToStore: 200,
    responseDelay: 1,
    requestWindow: {
        free: {
            perUser: {
                maxRequests: 30,
                windowMinutes: 180,
            },
            perChat: {
                maxRequests: 120,
                windowMinutes: 180,
            },
        },
        trusted: {
            perUser: {
                maxRequests: 300,
                windowMinutes: 180,
            },
            perChat: {
                maxRequests: 1200,
                windowMinutes: 180,
            },
        },
    },
};

export default defaultConfig;
