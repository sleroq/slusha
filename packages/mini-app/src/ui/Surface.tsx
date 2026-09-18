import type { ParentProps } from 'solid-js';

export function Surface(props: ParentProps<{ class?: string }>) {
    return <section class={['surface', props.class]}>{props.children}</section>;
}
