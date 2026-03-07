import { assertEquals, assertStringIncludes } from '@std/assert';
import { ModelMessage } from 'ai';
import {
    annotateHistoryWithTargetRefs,
    buildTargetRefs,
    buildTargetRefsPrompt,
} from './target-refs.ts';
import { ChatMessage } from '../memory.ts';
import { Message } from 'grammy_types';

function createChatMessage(
    id: number,
    text: string,
    isMyself = false,
    from?: { id?: number; username?: string; first_name?: string },
): ChatMessage {
    return {
        id,
        text,
        isMyself,
        info: {
            from,
        } as unknown as Message,
    };
}

Deno.test('buildTargetRefs builds refs from latest external messages', () => {
    const history: ChatMessage[] = [
        createChatMessage(10, 'hello one', false, {
            id: 1,
            username: 'alice',
            first_name: 'Alice',
        }),
        createChatMessage(11, 'bot msg', true),
        createChatMessage(12, 'hello two', false, {
            id: 2,
            first_name: 'Bob',
        }),
    ];

    const refs = buildTargetRefs(history, 5);

    assertEquals(refs.map((r) => r.ref), ['t0', 't1']);
    assertEquals(refs.map((r) => r.messageId), [12, 10]);
    assertEquals(refs[0].firstName, 'Bob');
    assertEquals(refs[1].username, '@alice');
});

Deno.test('buildTargetRefsPrompt returns fallback when no targets', () => {
    const prompt = buildTargetRefsPrompt([]);
    assertStringIncludes(prompt, 'There are no explicit targets right now');
});

Deno.test('annotateHistoryWithTargetRefs annotates m-id prefixes', () => {
    const messages: ModelMessage[] = [
        { role: 'user', content: '[m42][u1:@alice] Alice:\nhi' },
        {
            role: 'assistant',
            content: [{ type: 'text', text: '[m41] ok' }],
        },
    ];

    const annotated = annotateHistoryWithTargetRefs(messages, [{
        ref: 't0',
        messageId: 42,
        preview: 'hi',
    }, {
        ref: 't1',
        messageId: 41,
        preview: 'ok',
    }]);

    assertEquals(annotated[0], {
        role: 'user',
        content: '[t0][m42][u1:@alice] Alice:\nhi',
    });
    assertEquals(
        (annotated[1].content as Array<{ type: string; text: string }>)[0]
            .text,
        '[t1][m41] ok',
    );
});
