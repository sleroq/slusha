<script lang="ts">
    import SourceStateIcon from '$lib/components/config/SourceStateIcon.svelte';
    import { Button } from '$lib/components/ui/button';
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
        reactions: string[];
        hidden?: boolean;
        containerClass?: string;
        sourceState?: SourceState;
    }

    let {
        id,
        label,
        description,
        value = $bindable(),
        reactions = [],
        hidden = false,
        containerClass = '',
        sourceState,
    }: Props = $props();

    const parseItems = (raw: string | undefined): string[] =>
        (raw ?? '')
            .split('\n')
            .map((item) => item.trim())
            .filter((item) => item.length > 0);

    const normalizeItems = (items: string[]): string[] => {
        const normalized: string[] = [];

        for (const item of items) {
            const trimmed = item.trim();
            if (trimmed.length === 0 || normalized.includes(trimmed)) {
                continue;
            }

            normalized.push(trimmed);
        }

        return normalized;
    };

    const setItems = (items: string[]): void => {
        value = normalizeItems(items).join('\n');
    };

    const toggleReaction = (reaction: string): void => {
        const blocked = parseItems(value);
        if (blocked.includes(reaction)) {
            setItems(blocked.filter((item) => item !== reaction));
            return;
        }

        setItems([...blocked, reaction]);
    };

    const clearBlocked = (): void => {
        value = '';
    };

    let blockedItems = $derived(normalizeItems(parseItems(value)));
    let blockedSet = $derived(new Set(blockedItems));
    let allReactions = $derived.by(() => {
        const next = normalizeItems(reactions);

        for (const blocked of blockedItems) {
            if (!next.includes(blocked)) {
                next.push(blocked);
            }
        }

        return next;
    });

    const isBlocked = (reaction: string): boolean => blockedSet.has(reaction);
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

    <div class="space-y-3 rounded-md border p-3">
        <div class="flex items-center justify-between gap-2">
            <p class="text-xs text-muted-foreground">
                <span class="font-medium text-foreground">Blocked {blockedItems.length}</span>
                / {allReactions.length} reactions
            </p>
            {#if blockedItems.length > 0}
                <Button type="button" variant="ghost" size="sm" onclick={clearBlocked}>Clear blocked</Button>
            {/if}
        </div>

        {#if allReactions.length === 0}
            <p class="text-xs text-muted-foreground">No reactions available.</p>
        {:else}
            <div id={id} class="flex flex-wrap gap-2">
                {#each allReactions as reaction (reaction)}
                    <Button
                        type="button"
                        size="sm"
                        variant={isBlocked(reaction) ? 'destructive' : 'outline'}
                        aria-pressed={isBlocked(reaction)}
                        aria-label={`${reaction} reaction ${isBlocked(reaction) ? 'blocked' : 'allowed'}`}
                        onclick={() => toggleReaction(reaction)}
                    >
                        {reaction}
                    </Button>
                {/each}
            </div>
            <p class="text-xs text-muted-foreground">Select reactions to block them in this chat.</p>
        {/if}
    </div>
</div>
