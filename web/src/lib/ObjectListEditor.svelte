<script lang="ts">
    let {
        value,
        keys,
        onchange,
    }: {
        value: Array<Record<string, string>>;
        keys: string[];
        onchange: (value: Array<Record<string, string>>) => void;
    } = $props();

    function update(index: number, key: string, nextValue: string) {
        onchange(
            value.map((item, itemIndex) => {
                if (itemIndex !== index) return item;
                return { ...item, [key]: nextValue };
            }),
        );
    }

    function add() {
        const item: Record<string, string> = {};
        for (const key of keys) item[key] = '';
        onchange([...value, item]);
    }
</script>

<div class="space-y-2">
    {#each value as item, index (index)}
        <div
            class="flex items-center gap-2 rounded-xl bg-(--tg-theme-secondary-bg-color) p-2"
        >
            <div class="min-w-0 flex-1 space-y-2">
                {#each keys as key (key)}
                    <input
                        class="w-full rounded-lg border-0 bg-(--tg-theme-bg-color) text-sm"
                        aria-label={key}
                        placeholder={key}
                        value={item[key] ?? ''}
                        oninput={(event) =>
                        update(
                            index,
                            key,
                            event.currentTarget.value,
                        )}
                    />
                {/each}
            </div>
            <button
                type="button"
                class="grid min-h-11 min-w-11 place-items-center text-xl opacity-60"
                aria-label={`Remove item ${index + 1}`}
                onclick={() => onchange(value.filter((_, i) => i !== index))}
            >
                ×
            </button>
        </div>
    {/each}
    <button
        type="button"
        class="min-h-11 rounded-lg px-2 text-sm text-(--tg-theme-link-color)"
        onclick={add}
    >
        + Add item
    </button>
</div>
