import { createModels, fauxProvider } from '@earendil-works/pi-ai';
import { createAgentSessions } from './index';

const faux = fauxProvider({ provider: 'opencode-go', models: [{ id: 'first' }] });
const models = createModels();
models.setProvider(faux.provider);
faux.setResponses([
    () => {
        console.log('model-started');
        return new Promise(() => {});
    },
]);
const sessions = await createAgentSessions({
    dataDir: process.argv[2],
    models,
    actions: {
        async reply() {},
        async react() {},
        async shell() {
            return '';
        },
    },
});
await sessions.run(
    { chatId: -123, topicId: 7 },
    { eventId: 1, generation: 0, requestId: 'old', model: 'first', text: 'old request' },
);
