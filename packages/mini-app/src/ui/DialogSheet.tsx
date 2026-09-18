import { createEffect, onCleanup, type ParentProps } from 'solid-js';

export const DIALOG_CHANGE_EVENT = 'mini-app-dialog-change';

let nextDialogId = 0;
let scrollLockCount = 0;
let originalBodyOverflow = '';

export function hasOpenDialog() {
    return document.querySelector('dialog[open]') !== null;
}

export function dismissTopDialog() {
    const dialogs = Array.from(
        document.querySelectorAll<HTMLDialogElement>('dialog[open]'),
    );
    const dialog = dialogs.at(-1);
    if (!dialog) return false;
    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    if (!cancel.defaultPrevented && dialog.open) dialog.close();
    return true;
}

function announceDialogChange() {
    document.dispatchEvent(
        new CustomEvent(DIALOG_CHANGE_EVENT, {
            detail: hasOpenDialog(),
        }),
    );
}

export function DialogSheet(
    props: ParentProps<{
        open: boolean;
        title: string;
        onClose: () => void;
        class?: string;
    }>,
) {
    let dialog: HTMLDialogElement | undefined;
    let previous: HTMLElement | undefined;
    let bodyScrollLocked = false;
    let closeRequested = false;
    const titleId = `dialog-title-${nextDialogId++}`;

    function restoreFocus() {
        const opener = previous;
        previous = undefined;
        if (opener?.isConnected) opener.focus({ preventScroll: true });
    }

    function lockBodyScroll() {
        // A selection can open a confirmation before its close event arrives.
        if (scrollLockCount === 0) {
            originalBodyOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
        }
        scrollLockCount += 1;
        bodyScrollLocked = true;
    }

    function restoreBodyScroll() {
        if (!bodyScrollLocked) return;
        bodyScrollLocked = false;
        scrollLockCount -= 1;
        if (scrollLockCount === 0) {
            document.body.style.overflow = originalBodyOverflow;
        }
    }

    function closeNative() {
        if (dialog?.open) {
            closeRequested = true;
            dialog.close();
            return;
        }
        restoreFocus();
    }

    function handleCancel(event: Event) {
        event.preventDefault();
        closeRequested = true;
        props.onClose();
    }

    function handleClose() {
        const wasRequested = closeRequested;
        closeRequested = false;
        if (!wasRequested) props.onClose();
        restoreBodyScroll();
        restoreFocus();
        announceDialogChange();
    }

    createEffect(
        () => props.open,
        (open) => {
            if (open && dialog && !dialog.open) {
                previous = document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : undefined;
                closeRequested = false;
                dialog.showModal();
                lockBodyScroll();
                announceDialogChange();
            } else if (!open && dialog?.open) {
                closeNative();
            }
        },
    );

    onCleanup(() => {
        closeNative();
        restoreBodyScroll();
        restoreFocus();
        announceDialogChange();
    });

    return (
        <dialog
            ref={(element) => {
                dialog = element;
            }}
            class={['dialog-sheet', props.class]}
            aria-labelledby={titleId}
            onCancel={handleCancel}
            onClose={handleClose}
            onClick={(event) => {
                if (event.target !== dialog || !dialog) return;
                const rect = dialog.getBoundingClientRect();
                const outside = event.clientX < rect.left ||
                    event.clientX > rect.right ||
                    event.clientY < rect.top ||
                    event.clientY > rect.bottom;
                if (outside) dismissTopDialog();
            }}
        >
            <header>
                <h2 id={titleId}>{props.title}</h2>
                <button
                    type='button'
                    aria-label='Close'
                    onClick={dismissTopDialog}
                >
                    ×
                </button>
            </header>
            {props.children}
        </dialog>
    );
}
