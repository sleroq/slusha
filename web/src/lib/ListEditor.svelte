<script lang="ts">
    import type { Matcher } from './config';

    let {
        value,
        allowRegex,
        labelledby,
        expanded = false,
        onopen,
        onchange,
    }: {
        value: Matcher[];
        allowRegex: boolean;
        labelledby: string;
        expanded?: boolean;
        onopen?: () => void;
        onchange: (value: Matcher[]) => void;
    } = $props();
    let text = $state('');
    let regex = $state(false);

    function add() {
        const next = text.trim();
        if (!next) return;
        if (allowRegex && regex) {
            onchange([...value, { __regex: next }]);
        } else {
            onchange([...value, next]);
        }
        text = '';
    }

    function displayItem(item: Matcher) {
        if (typeof item === 'string') return item;
        return `/${item.__regex}/${item.flags ?? ''}`;
    }

    function preview() {
        if (value.length === 0) return 'None';
        const visible = value.slice(0, 2).map(displayItem).join(', ');
        if (value.length <= 2) return visible;
        return `${visible} +${value.length - 2}`;
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            event.preventDefault();
            add();
        }
    }
</script>

{#if !expanded}
    <button
        type="button"
        class="app-pressed flex min-h-11 w-full items-center gap-3 rounded-xl bg-(--tg-theme-secondary-bg-color) px-3 text-left"
        aria-labelledby={labelledby}
        onclick={onopen}
    >
        <span class="min-w-0 flex-1 truncate text-[15px] text-(--tg-theme-hint-color)">{preview()}</span>
        <svg class="size-5 shrink-0 text-(--tg-theme-hint-color)" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="m7.5 4.5 5 5.5-5 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
    </button>
{:else}
    <div class="space-y-3">
        <div class="flex flex-wrap gap-2">
            {#each value as item, index (index)}
                <span
                    class="flex max-w-full items-center gap-0.5 rounded-full bg-(--tg-theme-secondary-bg-color) py-0.5 pl-2.5 pr-1 text-[13px]"
                >
                    <span class="truncate">{displayItem(item)}</span>
                    <button
                        type="button"
                        class="grid size-7 place-items-center text-base leading-none opacity-60"
                        aria-label={`Remove ${displayItem(item)}`}
                        onclick={() => onchange(value.filter((_, i) => i !== index))}
                    >
                        ×
                    </button>
                </span>
            {/each}
        </div>
        <div class="flex gap-2">
            <input
                class="min-w-0 flex-1 rounded-xl border-0 bg-(--tg-theme-secondary-bg-color)"
                aria-labelledby={labelledby}
                bind:value={text}
                onkeydown={handleKeydown}
                placeholder="Add item"
            />
            {#if allowRegex}
                <button
                    type="button"
                    aria-pressed={regex}
                    class:regex-active={regex}
                    class="app-pressed min-h-11 min-w-11 rounded-xl px-3 text-sm"
                    onclick={() => regex = !regex}
                >
                    .*
                </button>
            {/if}
            <button
                type="button"
                class="min-h-11 rounded-xl bg-(--tg-theme-button-color) px-4 text-(--tg-theme-button-text-color)"
                onclick={add}
            >
                Add
            </button>
        </div>
    </div>
{/if}

<style>
    .regex-active {
        background: var(--tg-theme-button-color, #3390ec);
        color: var(--tg-theme-button-text-color, #ffffff);
    }
</style>
