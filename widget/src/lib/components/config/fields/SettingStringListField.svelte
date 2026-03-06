<script lang="ts">
    import TrashIcon from '@lucide/svelte/icons/trash';
    import { fade } from 'svelte/transition';
    import SourceStateIcon from '$lib/components/config/SourceStateIcon.svelte';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';

    interface SourceState {
        overridden: boolean;
        label: string;
    }

    interface Props {
        id: string;
        label: string;
        description: string;
        value: string | undefined;
        hidden?: boolean;
        containerClass?: string;
        sourceState?: SourceState;
        itemPlaceholder?: string;
        addLabel?: string;
        suggestions?: string[];
        numericOnly?: boolean;
        allowDuplicates?: boolean;
    }

    let {
        id,
        label,
        description,
        value = $bindable(),
        hidden = false,
        containerClass = '',
        sourceState,
        itemPlaceholder = 'Value',
        addLabel = 'Add',
        suggestions = [],
        numericOnly = false,
        allowDuplicates = true,
    }: Props = $props();

    let draft = $state('');

    const parseItems = (raw: string | undefined): string[] =>
        (raw ?? '')
            .split('\n')
            .map((item) => item.trim())
            .filter((item) => item.length > 0);

    const isValidItem = (item: string): boolean => {
        if (!numericOnly) {
            return true;
        }

        return /^-?\d+$/.test(item);
    };

    const setItems = (nextItems: string[]): void => {
        const normalized: string[] = [];
        const seen: string[] = [];

        for (const item of nextItems) {
            const trimmed = item.trim();
            if (trimmed.length === 0 || !isValidItem(trimmed)) {
                continue;
            }

            if (!allowDuplicates) {
                if (seen.includes(trimmed)) continue;
                seen.push(trimmed);
            }

            normalized.push(trimmed);
        }

        value = normalized.join('\n');
    };

    const addItem = (item: string): void => {
        const trimmed = item.trim();
        if (trimmed.length === 0 || !isValidItem(trimmed)) {
            return;
        }

        const items = parseItems(value);
        if (!allowDuplicates && items.includes(trimmed)) {
            return;
        }

        items.push(trimmed);
        setItems(items);
    };

    const removeItem = (index: number): void => {
        const items = parseItems(value);
        items.splice(index, 1);
        setItems(items);
    };

    const updateItem = (index: number, nextValue: string): void => {
        const items = parseItems(value);
        items[index] = nextValue;
        setItems(items);
    };

    const addDraft = (): void => {
        addItem(draft);
        draft = '';
    };

    let items = $derived(parseItems(value));
    let draftValid = $derived(draft.trim().length > 0 && isValidItem(draft.trim()));
    let visibleSuggestions = $derived.by(() => {
        const selected = new Set(items);
        return suggestions
            .map((suggestion) => suggestion.trim())
            .filter((suggestion) => suggestion.length > 0)
            .filter((suggestion) => allowDuplicates || !selected.has(suggestion));
    });
</script>

<div class={`space-y-2 ${containerClass}`.trim()} {hidden}>
    <Label for={id}>
        <span class="inline-flex items-center gap-1.5">
            {label}
            {#if sourceState}
                <SourceStateIcon overridden={sourceState.overridden} label={sourceState.label} />
            {/if}
        </span>
    </Label>
    <p class="text-xs text-muted-foreground">{description}</p>

    <div class="space-y-2 rounded-md border p-3">
        {#if items.length === 0}
            <p class="text-xs text-muted-foreground">No items yet.</p>
        {/if}

        {#each items as item, index (`${item}-${index}`)}
            <div class="flex items-center gap-2" in:fade={{ duration: 120 }} out:fade={{ duration: 90 }}>
                <Input
                    id={`${id}-${index}`}
                    value={item}
                    placeholder={itemPlaceholder}
                    oninput={(event) => updateItem(index, (event.currentTarget as HTMLInputElement).value)}
                />
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${label} item ${index + 1}`}
                    onclick={() => removeItem(index)}
                >
                    <TrashIcon class="h-4 w-4" />
                </Button>
            </div>
        {/each}

        <div class="flex items-center gap-2">
            <Input
                id={id}
                bind:value={draft}
                placeholder={itemPlaceholder}
                onkeydown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    addDraft();
                }}
            />
            <Button type="button" variant="outline" disabled={!draftValid} onclick={addDraft}>{addLabel}</Button>
        </div>

        {#if numericOnly}
            <p class="text-xs text-muted-foreground">Only whole numbers are accepted.</p>
        {/if}

        {#if visibleSuggestions.length > 0}
            <div class="flex flex-wrap gap-2 pt-1">
                {#each visibleSuggestions as suggestion (suggestion)}
                    <Button type="button" size="sm" variant="secondary" onclick={() => addItem(suggestion)}>
                        {suggestion}
                    </Button>
                {/each}
            </div>
        {/if}
    </div>
</div>
