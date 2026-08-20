<script lang="ts">
    import { onMount } from 'svelte';
    import { fade } from 'svelte/transition';

    let {
        saving,
        oncancel,
        ondiscard,
        onsave,
    }: {
        saving: boolean;
        oncancel: () => void;
        ondiscard: () => void;
        onsave: () => void;
    } = $props();

    let dialog: HTMLDivElement;
    let saveButton: HTMLButtonElement;
    const headingId = 'unsaved-changes-title';

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape' && !saving) {
            event.preventDefault();
            oncancel();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    onMount(() => {
        const opener = document.activeElement;
        saveButton.focus();
        return () => {
            if (opener instanceof HTMLElement) opener.focus();
        };
    });
</script>

<div class="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" transition:fade={{ duration: 140 }}>
    <div
        bind:this={dialog}
        class="w-full max-w-sm rounded-[22px] bg-(--tg-theme-bg-color) p-5 shadow-2xl"
        role="alertdialog"
        tabindex="-1"
        aria-modal="true"
        aria-labelledby={headingId}
        onkeydown={handleKeydown}
    >
        <h2 id={headingId} class="text-[20px] font-semibold">Save your changes?</h2>
        <p class="mt-2 text-[15px] text-(--tg-theme-hint-color)">Save or discard the changes in this scope before switching.</p>
        <div class="mt-5 flex flex-col gap-2">
            <button
                bind:this={saveButton}
                class="telegram-action-button min-h-12 rounded-full px-5 font-semibold disabled:opacity-40"
                disabled={saving}
                onclick={onsave}
            >{saving ? 'Saving…' : 'Save and continue'}</button>
            <button
                class="min-h-11 rounded-full px-5 font-semibold text-red-500 disabled:opacity-40"
                disabled={saving}
                onclick={ondiscard}
            >Discard changes</button>
            <button
                class="min-h-11 rounded-full px-5 text-(--tg-theme-link-color) disabled:opacity-40"
                disabled={saving}
                onclick={oncancel}
            >Cancel</button>
        </div>
    </div>
</div>
