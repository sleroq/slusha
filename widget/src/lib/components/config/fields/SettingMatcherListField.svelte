<script lang="ts">
    import TrashIcon from '@lucide/svelte/icons/trash';
    import { fade } from 'svelte/transition';
    import SourceStateIcon from '$lib/components/config/SourceStateIcon.svelte';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import * as Select from '$lib/components/ui/select';

    interface SourceState {
        overridden: boolean;
        label: string;
    }

    interface MatcherRow {
        type: 'literal' | 'regex';
        value: string;
        flags: string;
    }

    interface Props {
        id: string;
        label: string;
        description: string;
        value: string | undefined;
        hidden?: boolean;
        containerClass?: string;
        sourceState?: SourceState;
    }

    let {
        id,
        label,
        description,
        value = $bindable(),
        hidden = false,
        containerClass = '',
        sourceState,
    }: Props = $props();

    let newType = $state<MatcherRow['type']>('literal');
    let newValue = $state('');
    let newFlags = $state('');

    const VALID_FLAGS = 'dgimsuvy';

    const parseLines = (raw: string | undefined): string[] =>
        (raw ?? '')
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

    const normalizeFlags = (rawFlags: string): string => {
        const seen: string[] = [];
        let normalized = '';
        for (const char of rawFlags.trim()) {
            if (!VALID_FLAGS.includes(char) || seen.includes(char)) {
                continue;
            }

            seen.push(char);
            normalized += char;
        }

        return normalized;
    };

    const lineToRow = (line: string): MatcherRow => {
        if (!line.startsWith('/')) {
            return { type: 'literal', value: line, flags: '' };
        }

        const lastSlash = line.lastIndexOf('/');
        if (lastSlash <= 0) {
            return { type: 'literal', value: line, flags: '' };
        }

        return {
            type: 'regex',
            value: line.slice(1, lastSlash),
            flags: normalizeFlags(line.slice(lastSlash + 1)),
        };
    };

    const rowToLine = (row: MatcherRow): string => {
        const trimmedValue = row.value.trim();
        if (trimmedValue.length === 0) {
            return '';
        }

        if (row.type === 'literal') {
            return trimmedValue;
        }

        const flags = normalizeFlags(row.flags);
        return `/${trimmedValue}/${flags}`;
    };

    const parseRows = (raw: string | undefined): MatcherRow[] =>
        parseLines(raw).map(lineToRow);

    const setRows = (nextRows: MatcherRow[]): void => {
        value = nextRows
            .map(rowToLine)
            .filter((line) => line.length > 0)
            .join('\n');
    };

    const updateRow = (index: number, patch: Partial<MatcherRow>): void => {
        const rows = parseRows(value);
        rows[index] = {
            ...rows[index],
            ...patch,
            flags: patch.flags === undefined ? rows[index].flags : normalizeFlags(patch.flags),
        };

        setRows(rows);
    };

    const removeRow = (index: number): void => {
        const rows = parseRows(value);
        rows.splice(index, 1);
        setRows(rows);
    };

    const addRow = (): void => {
        const trimmedValue = newValue.trim();
        if (trimmedValue.length === 0) {
            return;
        }

        const rows = parseRows(value);
        rows.push({
            type: newType,
            value: trimmedValue,
            flags: newType === 'regex' ? normalizeFlags(newFlags) : '',
        });
        setRows(rows);

        newValue = '';
        newFlags = '';
        newType = 'literal';
    };

    const rowTypeLabel = (type: MatcherRow['type']): string =>
        type === 'regex' ? 'regex' : 'literal';

    let rows = $derived(parseRows(value));
    let canAddRow = $derived(newValue.trim().length > 0);
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

    <div class="overflow-hidden rounded-md border">
        <div class="overflow-x-auto">
            <table class="w-full border-collapse text-sm">
                <thead class="bg-muted/40 text-xs text-muted-foreground">
                    <tr class="border-b text-left">
                        <th class="w-28 px-3 py-2 font-medium">Type</th>
                        <th class="px-3 py-2 font-medium">Value</th>
                        <th class="w-24 px-3 py-2 font-medium">Flags</th>
                        <th class="w-12 px-3 py-2 font-medium"></th>
                    </tr>
                </thead>
                <tbody>
                    {#if rows.length === 0}
                        <tr>
                            <td class="px-3 py-3 text-xs text-muted-foreground" colspan="4">No patterns yet.</td>
                        </tr>
                    {/if}

                    {#each rows as row, index (`${row.type}-${row.value}-${index}`)}
                        <tr class="border-b align-top last:border-b-0" in:fade={{ duration: 120 }} out:fade={{ duration: 90 }}>
                            <td class="px-3 py-2">
                                <Select.Root
                                    type="single"
                                    value={row.type}
                                    onValueChange={(nextValue) => updateRow(index, { type: nextValue as MatcherRow['type'] })}
                                >
                                    <Select.Trigger class="h-9 w-full px-2">
                                        {rowTypeLabel(row.type)}
                                    </Select.Trigger>
                                    <Select.Content>
                                        <Select.Item value="literal" label="literal">literal</Select.Item>
                                        <Select.Item value="regex" label="regex">regex</Select.Item>
                                    </Select.Content>
                                </Select.Root>
                            </td>
                            <td class="px-3 py-2">
                                <Input
                                    value={row.value}
                                    placeholder={row.type === 'regex' ? 'Pattern' : 'Text value'}
                                    class="h-9"
                                    oninput={(event) => updateRow(index, { value: (event.currentTarget as HTMLInputElement).value })}
                                />
                            </td>
                            <td class="px-3 py-2">
                                <Input
                                    value={row.flags}
                                    disabled={row.type !== 'regex'}
                                    placeholder="gim"
                                    class="h-9"
                                    oninput={(event) => updateRow(index, { flags: (event.currentTarget as HTMLInputElement).value })}
                                />
                            </td>
                            <td class="px-3 py-2 text-right">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Remove ${label} matcher ${index + 1}`}
                                    onclick={() => removeRow(index)}
                                >
                                    <TrashIcon class="h-4 w-4" />
                                </Button>
                            </td>
                        </tr>
                    {/each}

                    <tr class="border-t align-top">
                        <td class="px-3 py-2">
                            <Select.Root type="single" value={newType} onValueChange={(nextValue) => (newType = nextValue as MatcherRow['type'])}>
                                <Select.Trigger id={id} class="h-9 w-full px-2">{rowTypeLabel(newType)}</Select.Trigger>
                                <Select.Content>
                                    <Select.Item value="literal" label="literal">literal</Select.Item>
                                    <Select.Item value="regex" label="regex">regex</Select.Item>
                                </Select.Content>
                            </Select.Root>
                        </td>
                        <td class="px-3 py-2">
                            <Input
                                value={newValue}
                                placeholder={newType === 'regex' ? 'Pattern' : 'Text value'}
                                class="h-9"
                                oninput={(event) => (newValue = (event.currentTarget as HTMLInputElement).value)}
                                onkeydown={(event) => {
                                    if (event.key !== 'Enter') return;
                                    event.preventDefault();
                                    addRow();
                                }}
                            />
                        </td>
                        <td class="px-3 py-2">
                            <Input
                                value={newFlags}
                                disabled={newType !== 'regex'}
                                placeholder="gim"
                                class="h-9"
                                oninput={(event) => (newFlags = (event.currentTarget as HTMLInputElement).value)}
                            />
                        </td>
                        <td class="px-3 py-2 text-right">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={!canAddRow}
                                onclick={addRow}
                            >
                                Add
                            </Button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="border-t px-3 py-2">
            <p class="text-xs text-muted-foreground">Regex format is stored as <code>/pattern/flags</code>.</p>
        </div>
    </div>
</div>
