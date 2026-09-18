import { createSignal, For } from 'solid-js';
import { DialogSheet } from './DialogSheet.tsx';

export function Selection(
    props: {
        value: string;
        options: string[];
        optional?: boolean;
        disabled?: boolean;
        labelledBy?: string;
        describedBy?: string;
        invalid?: boolean;
        onChange: (value: string) => void;
        onReset?: () => void;
    },
) {
    const [open, setOpen] = createSignal(false);
    function choose(value: string) {
        if (value === '' && props.onReset) {
            props.onReset();
        } else {
            props.onChange(value);
        }
        setOpen(false);
    }
    return (
        <>
            <button
                class='selection'
                type='button'
                disabled={props.disabled}
                aria-haspopup='dialog'
                aria-labelledby={props.labelledBy}
                aria-describedby={props.describedBy}
                aria-invalid={props.invalid ? 'true' : undefined}
                onClick={() => setOpen(true)}
            >
                {props.value || 'Not set'}
                <span aria-hidden='true'>⌄</span>
            </button>
            <DialogSheet
                open={open()}
                title='Choose an option'
                onClose={() => setOpen(false)}
            >
                <div class='selection-options'>
                    {props.optional && (
                        <button
                            type='button'
                            onClick={() => choose('')}
                        >
                            Not set
                        </button>
                    )}
                    <For each={props.options}>
                        {(option) => (
                            <button
                                type='button'
                                onClick={() => choose(option)}
                            >
                                {option}
                            </button>
                        )}
                    </For>
                </div>
            </DialogSheet>
        </>
    );
}
