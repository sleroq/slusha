<script lang="ts">
    import { Button } from '$lib/components/ui/button';
    import { useI18n } from '$lib/i18n/context.svelte';
    import type { ConfigRole } from '$lib/config/model';

    interface Props {
        status: string;
        role: ConfigRole;
        onReload: () => void;
        isReloading: boolean;
        isLoading: boolean;
    }

    let {
        status,
        role,
        onReload,
        isReloading = false,
        isLoading = false,
    }: Props = $props();

    const t = useI18n();
</script>

<section class="space-y-6 pb-6">
    <div class="flex items-start justify-between gap-3">
        <h1 class="text-xl font-semibold">{t('app.title')}</h1>
        <span class="rounded-full border px-2 py-1 text-xs font-medium text-foreground">{t('toolbar.role', { role })}</span>
    </div>

    <div class="space-y-4">
        <div class="grid gap-3 md:grid-cols-2">
            <div class="flex items-end">
                <Button class="w-full" onclick={onReload} disabled={isReloading || isLoading} aria-busy={isReloading}>
                    {isReloading ? t('toolbar.reloading') : t('toolbar.reload')}
                </Button>
            </div>
        </div>

        <p class="text-sm text-muted-foreground" role="status" aria-live="polite">
            {#if isLoading}
                <span class="inline-flex items-center gap-2">
                    <span class="size-3 animate-spin rounded-full border-2 border-muted-foreground/35 border-t-foreground"></span>
                    {t('toolbar.loadingConfiguration')}
                </span>
            {:else}
                {status}
            {/if}
        </p>
    </div>
</section>
