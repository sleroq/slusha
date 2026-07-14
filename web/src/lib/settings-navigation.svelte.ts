import type { ConfigSelection } from './config.ts';

export type SettingsView =
    | { kind: 'settings' }
    | { kind: 'chat-selector'; chatType: 'private' | 'group' }
    | { kind: 'expanded-editor'; fieldKey: string };

export function createSettingsNavigation(options: {
    hasPendingSelection: () => boolean;
    selection: () => ConfigSelection;
    cancelPendingSelection: () => void;
    requestSelection: (selection: ConfigSelection) => void;
}) {
    let view = $state<SettingsView>({ kind: 'settings' });

    function back() {
        if (options.hasPendingSelection()) {
            options.cancelPendingSelection();
        } else if (view.kind === 'expanded-editor') {
            view = { kind: 'settings' };
        } else if (view.kind === 'chat-selector') {
            view = { kind: 'settings' };
        } else if (options.selection().scope !== 'personal') {
            options.requestSelection({ scope: 'personal' });
        }
    }

    return {
        get view() { return view; },
        set view(next: SettingsView) { view = next; },
        back,
    };
}
