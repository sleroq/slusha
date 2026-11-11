import { type ParentProps, Show } from 'solid-js';
import { Button } from './Button.tsx';

export function Row(props: ParentProps<{ class?: string }>) {
    return <div class={['row', props.class]}>{props.children}</div>;
}

export function RowButton(props: {
    label: string;
    detail?: string;
    disabled?: boolean;
    onClick: () => void;
}) {
    return (
        <Button class="row-button" disabled={props.disabled} onClick={props.onClick}>
            <span>{props.label}</span>
            <Show when={props.detail}>
                <small>{props.detail}</small>
            </Show>
            <b aria-hidden="true">›</b>
        </Button>
    );
}
