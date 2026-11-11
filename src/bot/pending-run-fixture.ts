import {
    createModels,
    fauxAssistantMessage,
    fauxProvider,
    fauxToolCall,
} from '@earendil-works/pi-ai';
import { createAgentSessions } from '../agent';

const [dataDir, chatId, topicId, eventId, updateId] = process.argv.slice(2);
const faux = fauxProvider({ provider: 'opencode-go', models: [{ id: 'test' }] });
const models = createModels();
models.setProvider(faux.provider);
faux.setResponses([
    fauxAssistantMessage([fauxToolCall('shell', { command: 'test' })], { stopReason: 'toolUse' }),
    () => {
        console.log('model-started');
        return new Promise(() => {});
    },
]);
const sessions = await createAgentSessions({
    dataDir,
    models,
    actions: {
        async reply() {},
        async react() {},
        async shell() {
            return 'done';
        },
    },
});
await sessions.run(
    { chatId: Number(chatId), topicId: Number(topicId) },
    {
        requestId: updateId,
        eventId: Number(eventId),
        generation: 0,
        model: 'test',
        text: 'original message',
    },
);
