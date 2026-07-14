<script lang="ts">
    let {
        label,
        detail,
        disabled = false,
        onclick,
    }: {
        label: string;
        detail?: string;
        disabled?: boolean;
        onclick: () => void;
    } = $props();
</script>

<button
    type="button"
    class="app-pressed flex min-h-14 w-full items-center gap-3 px-4 text-left disabled:opacity-40"
    {disabled}
    {onclick}
>
    <span class="min-w-0 flex-1 text-[17px]">{label}</span>
    {#if detail}
        <span class="max-w-36 truncate text-[16px] text-(--tg-theme-hint-color)">
            {detail}
        </span>
    {/if}
    <svg class="size-5 text-(--tg-theme-hint-color)" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="m7.5 4.5 5 5.5-5 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
</button>
