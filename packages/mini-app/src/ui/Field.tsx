import { type ParentProps, Show } from 'solid-js';

export function Field(
    props: ParentProps<{
        label?: string;
        error?: string;
        errorId?: string;
        class?: string;
    }>,
) {
    return (
        <label class={['field', props.class]}>
            <Show when={props.label}>
                <span class="field-label">{props.label}</span>
            </Show>
            {props.children}
            <Show when={props.error}>
                <span id={props.errorId} class="field-error" role="alert">
                    {props.error}
                </span>
            </Show>
        </label>
    );
}
