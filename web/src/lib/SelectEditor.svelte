<script lang="ts">
    import { tick } from 'svelte';

    let {
        value,
        options,
        optional = false,
        labelledby,
        onselect,
        onreset,
    }: {
        value: string;
        options: string[];
        optional?: boolean;
        labelledby: string;
        onselect: (value: string) => void;
        onreset?: () => void;
    } = $props();

    let dialog: HTMLDialogElement;
    let open = $state(false);

    function selectedLabel() {
        if (value === '') return 'Not set';
        return value;
    }

    async function showOptions() {
        open = true;
        dialog.showModal();
        await tick();
        dialog.querySelector<HTMLButtonElement>('[data-selected="true"]')?.focus();
    }

    function closeOptions() {
        dialog.close();
    }

    function select(value: string) {
        if (value === '' && optional) onreset?.();
        else onselect(value);
        closeOptions();
    }
</script>

<button
    class="app-pressed flex min-h-11 w-full items-center gap-3 rounded-xl bg-(--tg-theme-secondary-bg-color) px-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tg-theme-link-color)"
    type="button"
    aria-labelledby={labelledby}
    aria-haspopup="dialog"
    aria-expanded={open}
    onclick={showOptions}
>
    <span class="min-w-0 flex-1 truncate">{selectedLabel()}</span>
    <svg class="size-5 shrink-0 text-(--tg-theme-hint-color)" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="m5 7.5 5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
</button>

<dialog
    bind:this={dialog}
    class="fixed m-0 max-h-[70dvh] max-w-none overflow-hidden rounded-t-[28px] border-0 bg-(--tg-theme-bg-color) p-0 text-(--tg-theme-text-color) shadow-2xl backdrop:bg-black/70"
    style="inset-block-start: auto; inset-block-end: 0; left: var(--app-safe-left); right: var(--app-safe-right); width: auto;"
    aria-labelledby={labelledby}
    onclose={() => open = false}
    onclick={(event) => {
        if (event.target === event.currentTarget) closeOptions();
    }}
>
    <div class="mx-auto my-2 h-1.5 w-12 rounded-full bg-(--tg-theme-hint-color) opacity-60"></div>
    <header class="flex min-h-12 items-center justify-between px-4">
        <h2 class="text-[17px] font-semibold">Choose an option</h2>
        <button
            class="min-h-11 px-2 text-[17px] text-(--tg-theme-link-color)"
            type="button"
            onclick={closeOptions}
        >
            Cancel
        </button>
    </header>
    <div class="max-h-[calc(70dvh-4rem)] overflow-y-auto pb-(--app-safe-bottom)">
        {#if optional}
            <button
                data-selected={value === '' ? 'true' : undefined}
                class="app-pressed flex min-h-14 w-full items-center gap-3 px-4 text-left"
                class:bg-(--tg-theme-secondary-bg-color)={value === ''}
                type="button"
                onclick={() => select('')}
            >
                <span class="min-w-0 flex-1 text-[17px]">Not set</span>
                {#if value === ''}
                    <svg class="size-5 shrink-0 text-(--tg-theme-link-color)" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <path d="m4.5 10 3.5 3.5 7.5-7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                {/if}
            </button>
        {/if}
        {#each options as option (option)}
            <button
                data-selected={value === option ? 'true' : undefined}
                class="app-pressed app-separator flex min-h-14 w-full items-center gap-3 border-t px-4 text-left"
                class:bg-(--tg-theme-secondary-bg-color)={value === option}
                type="button"
                onclick={() => select(option)}
            >
                <span class="min-w-0 flex-1 break-words text-[17px]">{option}</span>
                {#if value === option}
                    <svg class="size-5 shrink-0 text-(--tg-theme-link-color)" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <path d="m4.5 10 3.5 3.5 7.5-7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                {/if}
            </button>
        {/each}
    </div>
</dialog>
