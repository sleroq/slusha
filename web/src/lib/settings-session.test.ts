import { flushSync } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import type { ConfigField, ConfigResponse } from './config.ts';
import { createSettingsNavigation } from './settings-navigation.svelte.ts';
import { createSettingsSession } from './settings-session.svelte.ts';

function textField(key: string, value: string): ConfigField {
    return { key, kind: 'text', value, overridden: true, writable: true };
}

function response(scope: ConfigResponse['scope'], value: string): ConfigResponse {
    return {
        scope,
        fields: [textField('value', value)],
        chats: [],
        scopes: ['personal', 'global'],
        isAdmin: true,
    };
}

function update(session: ReturnType<typeof createSettingsSession>, value: string) {
    session.updateField(textField('value', value));
    flushSync();
}

describe('settings session', () => {
    it('keeps the committed snapshot when a selection load fails', async () => {
        const load = vi.fn()
            .mockResolvedValueOnce(response('personal', 'personal'))
            .mockRejectedValueOnce(new Error('load failed'));
        const session = createSettingsSession({ load });
        await session.initialize('auth');

        expect(await session.requestSelection({ scope: 'global' })).toBe(false);
        expect(session.selection).toEqual({ scope: 'personal', chatId: undefined });
        expect(session.fields[0].value).toBe('personal');
        expect(session.error).toBe('load failed');
    });

    it('guards dirty navigation with a pending selection', async () => {
        const load = vi.fn().mockResolvedValue(response('personal', 'personal'));
        const session = createSettingsSession({ load });
        await session.initialize('auth');
        update(session, 'changed');
        expect(session.fields[0].value).toBe('changed');
        expect(session.changeCount).toBe(1);

        expect(await session.requestSelection({ scope: 'global' })).toBe(false);
        expect(session.pendingSelection).toEqual({ scope: 'global' });
        expect(load).toHaveBeenCalledTimes(1);
    });

    it('saves current changes before loading and committing a pending selection', async () => {
        const events: string[] = [];
        const load = vi.fn((_auth: string, selection?: { scope: string }) => {
            events.push(`load:${selection?.scope ?? 'initial'}`);
            if (selection?.scope === 'global') {
                return Promise.resolve(response('global', 'global'));
            }
            return Promise.resolve(response('personal', 'reloaded'));
        });
        const save = vi.fn(() => {
            events.push('save');
            return Promise.resolve();
        });
        const session = createSettingsSession({ load, save });
        await session.initialize('auth');
        update(session, 'changed');
        await session.requestSelection({ scope: 'global' });

        expect(await session.saveAndSwitch()).toBe(true);
        expect(events).toEqual(['load:initial', 'save', 'load:personal', 'load:global']);
        expect(session.selection.scope).toBe('global');
        expect(session.fields[0].value).toBe('global');
    });

    it('rejects field updates and resets during the save and reload interval', async () => {
        let finishSave!: () => void;
        const savePending = new Promise<void>((resolve) => { finishSave = resolve; });
        const load = vi.fn()
            .mockResolvedValueOnce(response('personal', 'original'))
            .mockResolvedValueOnce(response('personal', 'saved'));
        const session = createSettingsSession({ load, save: vi.fn(() => savePending) });
        await session.initialize('auth');
        update(session, 'changed');

        const saving = session.save();
        expect(session.saving).toBe(true);
        session.updateField(textField('value', 'late edit'));
        session.resetField('value');
        expect(session.fields[0].value).toBe('changed');
        expect(session.isResetPending('value')).toBe(false);
        finishSave();
        await saving;
        expect(session.fields[0].value).toBe('saved');
    });

    it('does not start a second save while one is in progress', async () => {
        let finishSave!: () => void;
        const savePending = new Promise<void>((resolve) => { finishSave = resolve; });
        const load = vi.fn()
            .mockResolvedValueOnce(response('personal', 'original'))
            .mockResolvedValueOnce(response('personal', 'saved'));
        const save = vi.fn(() => savePending);
        const session = createSettingsSession({ load, save });
        await session.initialize('auth');
        update(session, 'changed');

        const firstSave = session.save();
        expect(await session.save()).toBe(false);
        expect(save).toHaveBeenCalledTimes(1);
        finishSave();
        expect(await firstSave).toBe(true);
    });

    it('discards without saving and commits the requested selection', async () => {
        const load = vi.fn()
            .mockResolvedValueOnce(response('personal', 'personal'))
            .mockResolvedValueOnce(response('global', 'global'));
        const save = vi.fn();
        const session = createSettingsSession({ load, save });
        await session.initialize('auth');
        update(session, 'changed');
        await session.requestSelection({ scope: 'global' });

        expect(await session.discardAndSwitch()).toBe(true);
        expect(save).not.toHaveBeenCalled();
        expect(session.selection.scope).toBe('global');
    });
});

describe('settings navigation', () => {
    it('handles back in pending, editor, selector, then scope priority', () => {
        let pending = true;
        const selection = { scope: 'global' } as const;
        const cancel = vi.fn(() => { pending = false; });
        const request = vi.fn();
        const navigation = createSettingsNavigation({
            hasPendingSelection: () => pending,
            selection: () => selection,
            cancelPendingSelection: cancel,
            requestSelection: request,
        });
        navigation.view = { kind: 'expanded-editor', fieldKey: 'value', sectionId: 'prompts' };

        navigation.back();
        expect(cancel).toHaveBeenCalledOnce();
        expect(navigation.view.kind).toBe('expanded-editor');
        navigation.back();
        expect(navigation.view.kind).toBe('section');
        navigation.back();
        expect(navigation.view.kind).toBe('settings');
        navigation.view = { kind: 'chat-selector', chatType: 'group' };
        navigation.back();
        expect(navigation.view.kind).toBe('settings');
        navigation.back();
        expect(request).toHaveBeenCalledWith({ scope: 'personal' });
    });
});
