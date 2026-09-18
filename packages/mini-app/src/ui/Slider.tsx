type RangePointerGesture = {
    pointerId: number;
    startX: number;
    startY: number;
    startValue: number;
    intent: 'pending' | 'horizontal' | 'vertical';
    pendingValue: number | null;
};

const rangeGestureThreshold = 8;

export function Slider(
    props: {
        value: number;
        min: number;
        max: number;
        step: number;
        disabled?: boolean;
        labelledBy?: string;
        describedBy?: string;
        invalid?: boolean;
        onChange: (value: number) => void;
    },
) {
    let rangePointerGesture: RangePointerGesture | null = null;
    const progress = () =>
        `${((props.value - props.min) / (props.max - props.min)) * 100}%`;

    function startRangeGesture(event: PointerEvent) {
        rangePointerGesture = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startValue: props.value,
            intent: 'pending',
            pendingValue: null,
        };
    }

    function moveRangeGesture(event: PointerEvent, input: HTMLInputElement) {
        const gesture = rangePointerGesture;
        if (
            !gesture || gesture.pointerId !== event.pointerId ||
            gesture.intent !== 'pending'
        ) return;

        const horizontalDistance = Math.abs(event.clientX - gesture.startX);
        const verticalDistance = Math.abs(event.clientY - gesture.startY);
        if (
            Math.max(horizontalDistance, verticalDistance) <
                rangeGestureThreshold
        ) return;

        if (verticalDistance > horizontalDistance) {
            gesture.intent = 'vertical';
            gesture.pendingValue = null;
            input.value = String(gesture.startValue);
        } else {
            gesture.intent = 'horizontal';
            if (gesture.pendingValue !== null) {
                props.onChange(gesture.pendingValue);
                gesture.pendingValue = null;
            }
        }
    }

    function finishRangeGesture(event: PointerEvent) {
        const gesture = rangePointerGesture;
        if (!gesture || gesture.pointerId !== event.pointerId) return;

        if (gesture.intent !== 'vertical' && gesture.pendingValue !== null) {
            props.onChange(gesture.pendingValue);
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

    return (
        <input
            class='slider'
            type='range'
            min={props.min}
            max={props.max}
            step={props.step}
            value={props.value}
            disabled={props.disabled}
            aria-labelledby={props.labelledBy}
            aria-describedby={props.describedBy}
            aria-invalid={props.invalid ? 'true' : undefined}
            style={{ '--range-progress': progress() }}
            onPointerDown={startRangeGesture}
            onPointerMove={(event) =>
                moveRangeGesture(event, event.currentTarget)}
            onPointerUp={finishRangeGesture}
            onPointerCancel={(event) =>
                cancelRangeGesture(event, event.currentTarget)}
            onKeyDown={() => {
                rangePointerGesture = null;
            }}
            onInput={(event) => {
                const gesture = rangePointerGesture;
                if (gesture) {
                    if (gesture.intent === 'pending') {
                        gesture.pendingValue = Number(
                            event.currentTarget.value,
                        );
                        return;
                    }
                    if (gesture.intent === 'vertical') {
                        event.currentTarget.value = String(gesture.startValue);
                        return;
                    }
                }
                props.onChange(Number(event.currentTarget.value));
            }}
        />
    );
}
