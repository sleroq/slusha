import type { ParentProps } from 'solid-js';

type ButtonProps = ParentProps<{
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    class?: string;
    'aria-label'?: string;
    'aria-pressed'?: 'true' | 'false';
    onClick?: (event: MouseEvent) => void;
}>;

export function Button(props: ButtonProps) {
    return (
        <button
            type={props.type ?? 'button'}
            class={props.class}
            disabled={props.disabled}
            aria-label={props['aria-label']}
            aria-pressed={props['aria-pressed']}
            onClick={(event) => props.onClick?.(event)}
        >
            {props.children}
        </button>
    );
}
