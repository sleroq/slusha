<script lang="ts">
    import { Label } from '$lib/components/ui/label';

    interface Props {
        label: string;
        value: string;
        hidden?: boolean;
        containerClass?: string;
        valueClass?: string;
    }

    let {
        label,
        value,
        hidden = false,
        containerClass = '',
        valueClass = 'rounded-md border px-3 py-2 text-sm',
    }: Props = $props();
</script>

<div class={`space-y-2 ${containerClass}`.trim()} {hidden}>
    <Label>{label}</Label>
    <p class={valueClass}>{value}</p>
</div>
