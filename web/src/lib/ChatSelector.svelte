<script lang="ts">
    import { onMount } from 'svelte';
    import { fade } from 'svelte/transition';
    import type { ConfigChat } from './config';

    let {
        title,
        chats,
        oncancel,
        onselect,
    }: {
        title: string;
        chats: ConfigChat[];
        oncancel: () => void;
        onselect: (chat: ConfigChat) => void;
    } = $props();

    let query = $state('');
    let dialog: HTMLDivElement;
    let search: HTMLInputElement;
    const headingId = 'chat-selector-title';
    const visibleChats = $derived(
        chats.filter((chat) =>
            chat.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())
        ),
    );

    function sheetTransition(node: Element) {
        void node;
        const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
        return {
            duration: reduceMotion ? 0 : 180,
            css: (t: number) => `opacity: ${t}; transform: translateY(${(1 - t) * 24}px)`,
        };
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            event.preventDefault();
            oncancel();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = Array.from(
            dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'),
        );
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
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        search.focus();
        return () => {
            document.body.style.overflow = previousOverflow;
            if (opener instanceof HTMLElement) opener.focus();
        };
    });
</script>

<div
    class="fixed inset-0 z-50 bg-black/70"
    role="presentation"
    transition:fade={{ duration: 140 }}
    onclick={(event) => {
        if (event.target === event.currentTarget) oncancel();
    }}
>
    <div
        bind:this={dialog}
        class="selector-sheet app-separator absolute bottom-0 flex min-h-[72dvh] flex-col rounded-t-[28px] border px-3 pb-(--app-safe-bottom) shadow-2xl"
        style="left: var(--app-safe-left); right: var(--app-safe-right); max-height: calc(var(--app-viewport-height) - var(--app-safe-top));"
        role="dialog"
        tabindex="-1"
        aria-modal="true"
        aria-labelledby={headingId}
        onkeydown={handleKeydown}
        transition:sheetTransition
    >
        <div class="mx-auto my-2 h-1.5 w-12 rounded-full bg-(--tg-theme-hint-color) opacity-60"></div>
        <header class="grid grid-cols-[1fr_auto_1fr] items-center py-2">
            <button class="min-h-11 justify-self-start px-2 py-2 text-[17px] text-(--tg-theme-link-color)" onclick={oncancel}>Cancel</button>
            <h2 id={headingId} class="text-[17px] font-semibold">{title}</h2>
            <span></span>
        </header>
        <label class="relative mb-3 block">
            <span class="sr-only">Search chats</span>
            <svg class="pointer-events-none absolute left-3 top-3 size-5 text-(--tg-theme-hint-color)" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.7" />
                <path d="m12.5 12.5 4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
            </svg>
            <input
                bind:this={search}
                class="selector-search h-11 w-full rounded-xl border-0 pl-10 text-[17px] placeholder:text-(--tg-theme-hint-color) focus:ring-2 focus:ring-(--tg-theme-button-color)"
                type="search"
                placeholder="Search"
                bind:value={query}
            />
        </label>
        <section class="min-h-0 flex-1 overflow-y-auto">
            {#each visibleChats as chat, index (chat.id)}
                <button
                    type="button"
                    class="app-pressed flex min-h-16 w-full cursor-pointer items-center gap-3 px-3 text-left"
                    onclick={() => onselect(chat)}
                >
                    <span class="grid size-11 shrink-0 place-items-center rounded-full bg-(--tg-theme-button-color) text-lg font-semibold text-(--tg-theme-button-text-color)">
                        {chat.title.slice(0, 1).toLocaleUpperCase()}
                    </span>
                    <span class="app-separator flex min-w-0 flex-1 items-center self-stretch" class:border-t={index > 0}>
                        <span class="min-w-0 flex-1 truncate text-[17px]">{chat.title}</span>
                        <svg class="size-5 text-(--tg-theme-hint-color)" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <path d="m7.5 4.5 5 5.5-5 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                    </span>
                </button>
            {:else}
                <p class="p-8 text-center text-(--tg-theme-hint-color)">No chats found</p>
            {/each}
        </section>
    </div>
</div>
