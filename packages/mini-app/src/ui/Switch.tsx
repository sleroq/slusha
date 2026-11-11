export function Switch(props: {
    checked: boolean;
    disabled?: boolean;
    labelledBy?: string;
    describedBy?: string;
    invalid?: boolean;
    onChange: (value: boolean) => void;
}) {
    return (
        <label class="switch">
            <input
                type="checkbox"
                checked={props.checked}
                disabled={props.disabled}
                aria-labelledby={props.labelledBy}
                aria-describedby={props.describedBy}
                aria-invalid={props.invalid ? 'true' : undefined}
                onChange={(event) => props.onChange(event.currentTarget.checked)}
            />
            <span aria-hidden="true" />
        </label>
    );
}
