export function Loading(props: { label?: string }) {
    return (
        <div class="loading" role="status" aria-label={props.label ?? 'Loading'}>
            <span />
            <span />
            <span />
        </div>
    );
}
