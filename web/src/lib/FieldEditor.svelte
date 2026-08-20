<script lang="ts">
    import ListEditor from './ListEditor.svelte';
    import ObjectListEditor from './ObjectListEditor.svelte';
    import SelectEditor from './SelectEditor.svelte';
    import type { ConfigField, Matcher } from './config.ts';

    let {
        field,
        labelledby,
        expanded = false,
        onopen,
        onreset,
        onchange,
    }: {
        field: ConfigField;
        labelledby: string;
        expanded?: boolean;
        onopen?: () => void;
        onreset?: () => void;
        onchange: (field: ConfigField) => void;
    } = $props();

    function stringsOnly(items: Matcher[]) {
        return items.filter((item): item is string => typeof item === 'string');
    }

    function booleanValue(value: boolean | null) {
        if (value === null) return '';
        if (value) return 'Enabled';
        return 'Disabled';
    }

    function rangeProgress(value: number, min: number, max: number) {
        return ((value - min) / (max - min)) * 100;
    }

    type RangePointerGesture = {
        pointerId: number;
        startX: number;
        startY: number;
        startValue: number;
        intent: 'pending' | 'horizontal' | 'vertical';
        pendingValue: number | null;
    };

    const rangeGestureThreshold = 8;
    let rangePointerGesture = $state<RangePointerGesture | null>(null);

    function startRangeGesture(event: PointerEvent, value: number) {
        rangePointerGesture = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startValue: value,
            intent: 'pending',
            pendingValue: null,
        };
    }

    function moveRangeGesture(
        event: PointerEvent,
        input: HTMLInputElement,
        changeValue: (value: number) => void,
    ) {
        const gesture = rangePointerGesture;
        if (!gesture || gesture.pointerId !== event.pointerId || gesture.intent !== 'pending') return;

        const horizontalDistance = Math.abs(event.clientX - gesture.startX);
        const verticalDistance = Math.abs(event.clientY - gesture.startY);
        if (Math.max(horizontalDistance, verticalDistance) < rangeGestureThreshold) return;

        if (verticalDistance > horizontalDistance) {
            gesture.intent = 'vertical';
            gesture.pendingValue = null;
            input.value = String(gesture.startValue);
        } else {
            gesture.intent = 'horizontal';
            if (gesture.pendingValue !== null) {
                changeValue(gesture.pendingValue);
                gesture.pendingValue = null;
            }
        }
    }

    function finishRangeGesture(event: PointerEvent, changeValue: (value: number) => void) {
        const gesture = rangePointerGesture;
        if (!gesture || gesture.pointerId !== event.pointerId) return;

        if (gesture.intent !== 'vertical' && gesture.pendingValue !== null) {
            changeValue(gesture.pendingValue);
        }
        rangePointerGesture = null;
    }

    function cancelRangeGesture(event: PointerEvent, input: HTMLInputElement) {
        const gesture = rangePointerGesture;
        if (!gesture || gesture.pointerId !== event.pointerId) return;

        if (gesture.intent !== 'horizontal') {
            input.value = String(gesture.startValue);
        }
        rangePointerGesture = null;
    }
</script>

{#if field.kind === 'boolean'}
    {#if field.optional}
        <SelectEditor
            value={booleanValue(field.value)}
            options={['Enabled', 'Disabled']}
            optional={true}
            {labelledby}
            onreset={onreset}
            onselect={(value) => onchange({ ...field, value: value === 'Enabled' })}
        />
    {:else}
        <label class="relative inline-flex min-h-11 cursor-pointer items-center">
            <input
                class="peer sr-only"
                type="checkbox"
                aria-labelledby={labelledby}
                checked={field.value === true}
                onchange={(event) =>
                onchange({
                    ...field,
                    value: event.currentTarget.checked,
                })}
            />
            <span
                class="switch-track h-7 w-12 rounded-full after:absolute after:left-1 after:top-3 after:h-5 after:w-5 after:rounded-full after:transition peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--tg-theme-link-color) peer-checked:bg-(--tg-theme-button-color) peer-checked:after:translate-x-5"
            ></span>
        </label>
    {/if}
{:else if field.kind === 'number'}
    <input
        class="w-28 rounded-xl border-0 bg-(--tg-theme-secondary-bg-color) text-right"
        type="number"
        aria-labelledby={labelledby}
        value={field.value ?? ''}
        oninput={(event) => {
            const input = event.currentTarget.value;
            if (input === '') {
                onreset?.();
                return;
            }
            onchange({ ...field, value: Number(input) });
        }}
    />
{:else if field.kind === 'range'}
    <div class="w-full">
        <div class="mb-1 flex items-center justify-between text-sm text-(--tg-theme-hint-color)">
            <span>{field.min}{field.unit ?? ''}</span>
            <output class="font-medium text-(--tg-theme-link-color)" for={`range-${field.key}`}>
                {field.value}{field.unit ?? ''}
            </output>
            <span>{field.max}{field.unit ?? ''}</span>
        </div>
        <input
            id={`range-${field.key}`}
            class="settings-range"
            type="range"
            aria-labelledby={labelledby}
            min={field.min}
            max={field.max}
            step={field.step}
            value={field.value}
            style={`--range-progress: ${rangeProgress(field.value, field.min, field.max)}%`}
            onpointerdown={(event) => {
                startRangeGesture(event, field.value);
            }}
            onpointermove={(event) => {
                moveRangeGesture(event, event.currentTarget, (value) => onchange({ ...field, value }));
            }}
            onpointerup={(event) => {
                finishRangeGesture(event, (value) => onchange({ ...field, value }));
            }}
            onpointercancel={(event) => {
                cancelRangeGesture(event, event.currentTarget);
            }}
            onkeydown={() => {
                rangePointerGesture = null;
            }}
            oninput={(event) => {
                if (rangePointerGesture) {
                    if (rangePointerGesture.intent === 'pending') {
                        rangePointerGesture.pendingValue = Number(event.currentTarget.value);
                        return;
                    }
                    if (rangePointerGesture.intent === 'vertical') {
                        event.currentTarget.value = String(rangePointerGesture.startValue);
                        return;
                    }
                }
                onchange({ ...field, value: Number(event.currentTarget.value) });
            }}
        />
    </div>
{:else if field.kind === 'object-list'}
    <ObjectListEditor
        value={field.value}
        keys={field.keys}
        onchange={(value) => onchange({ ...field, value })}
    />
{:else if field.kind === 'matcher-list'}
    <ListEditor
        value={field.value}
        allowRegex={true}
        {labelledby}
        {expanded}
        {onopen}
        onchange={(value) => onchange({ ...field, value })}
    />
{:else if field.kind === 'string-list'}
    <ListEditor
        value={field.value}
        allowRegex={false}
        {labelledby}
        {expanded}
        {onopen}
        onchange={(value) =>
        onchange({
            ...field,
            value: stringsOnly(value),
        })}
    />
{:else if field.kind === 'select'}
    <SelectEditor
        value={field.value ?? ''}
        options={field.options}
        optional={field.optional}
        {labelledby}
        onreset={onreset}
        onselect={(value) => onchange({ ...field, value })}
    />
{:else if field.multiline}
    <textarea
        class="min-h-48 w-full resize-y rounded-xl border-0 bg-(--tg-theme-secondary-bg-color) leading-relaxed"
        aria-labelledby={labelledby}
        value={field.value ?? ''}
        oninput={(event) =>
        onchange({
            ...field,
            value: event.currentTarget.value,
        })}
    ></textarea>
{:else}
    <input
        class="w-full rounded-xl border-0 bg-(--tg-theme-secondary-bg-color)"
        type="text"
        aria-labelledby={labelledby}
        value={field.value ?? ''}
        oninput={(event) =>
        onchange({
            ...field,
            value: event.currentTarget.value,
        })}
    />
{/if}

<style>
    .switch-track {
        background: color-mix(in srgb, var(--tg-theme-hint-color, #707579) 32%, transparent);
    }

    .switch-track::after {
        background: var(--tg-theme-bg-color, #ffffff);
        box-shadow: 0 1px 2px color-mix(in srgb, var(--tg-theme-text-color, #111827) 20%, transparent);
    }

    .settings-range {
        width: 100%;
        height: 1.75rem;
        margin: 0;
        padding: 0;
        cursor: pointer;
        touch-action: pan-y;
        appearance: none;
        border: 0;
        background: transparent;
    }

    .settings-range::-webkit-slider-runnable-track {
        height: 0.25rem;
        border-radius: 9999px;
        background: linear-gradient(
            to right,
            var(--tg-theme-button-color, #3390ec) var(--range-progress),
            color-mix(in srgb, var(--tg-theme-hint-color, #707579) 32%, transparent) var(--range-progress)
        );
    }

    .settings-range::-webkit-slider-thumb {
        width: 1.25rem;
        height: 1.25rem;
        margin-top: -0.5rem;
        appearance: none;
        border: 0;
        border-radius: 9999px;
        background: var(--tg-theme-button-color, #3390ec);
        box-shadow: 0 1px 3px color-mix(in srgb, var(--tg-theme-text-color, #111827) 24%, transparent);
    }

    .settings-range::-moz-range-track {
        height: 0.25rem;
        border-radius: 9999px;
        background: color-mix(in srgb, var(--tg-theme-hint-color, #707579) 32%, transparent);
    }

    .settings-range::-moz-range-progress {
        height: 0.25rem;
        border-radius: 9999px;
        background: var(--tg-theme-button-color, #3390ec);
    }

    .settings-range::-moz-range-thumb {
        width: 1.25rem;
        height: 1.25rem;
        border: 0;
        border-radius: 9999px;
        background: var(--tg-theme-button-color, #3390ec);
        box-shadow: 0 1px 3px color-mix(in srgb, var(--tg-theme-text-color, #111827) 24%, transparent);
    }
</style>
