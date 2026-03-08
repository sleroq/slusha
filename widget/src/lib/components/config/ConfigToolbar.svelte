<script lang="ts">
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import * as Select from '$lib/components/ui/select';
    import { useI18n } from '$lib/i18n/context.svelte';
    import type {
        AvailableChat,
        ConfigRole,
        ConfigScope,
        UsageWindowStatus,
    } from '$lib/config/model';

    interface Props {
        scope: ConfigScope;
        chatId: string;
        status: string;
        canViewGlobal: boolean;
        role: ConfigRole;
        availableChats: AvailableChat[];
        usageWindowStatus?: UsageWindowStatus;
        onReload: () => void;
        isReloading: boolean;
        isLoading: boolean;
    }

    let {
        scope = $bindable(),
        chatId = $bindable(),
        status,
        canViewGlobal,
        role,
        availableChats,
        usageWindowStatus,
        onReload,
        isReloading = false,
        isLoading = false,
    }: Props = $props();

    const t = useI18n();

    let chatSearch = $state('');

    let selectedChatLabel = $derived.by(() => {
        const selected = availableChats.find((chat) => String(chat.id) === chatId);
        if (!selected) {
            return availableChats.length > 0 ? t('toolbar.selectChat') : t('toolbar.noChats');
        }

        return selected.username
            ? `${selected.title} (@${selected.username})`
            : selected.title;
    });

    let filteredChats = $derived.by(() => {
        const query = chatSearch.trim().toLowerCase();
        if (!query) {
            return availableChats;
        }

        const selected = availableChats.find((chat) => String(chat.id) === chatId);
        const matches = availableChats.filter((chat) => {
            const title = chat.title.toLowerCase();
            const username = chat.username?.toLowerCase() ?? '';
            const id = String(chat.id);
            return title.includes(query) || username.includes(query) || id.includes(query);
        });

        if (!selected || matches.some((chat) => chat.id === selected.id)) {
            return matches;
        }

        return [selected, ...matches];
    });

    const handleChatChange = (nextValue: string): void => {
        if (nextValue === chatId) {
            return;
        }

        chatId = nextValue;
        onReload();
    };
</script>

<section class="space-y-6 pb-6">
    <div class="flex items-start justify-between gap-3">
        <h1 class="text-xl font-semibold">{t('app.title')}</h1>
        <span class="rounded-full border px-2 py-1 text-xs font-medium text-foreground">{t('toolbar.role', { role })}</span>
    </div>

    <div class="space-y-4">
        {#if usageWindowStatus}
            <div class="space-y-1 rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <div class="flex items-center justify-between gap-2">
                        <span class="font-medium text-foreground">
                            {t('toolbar.usage', { tier: usageWindowStatus.tier })}
                        </span>
                        {#if usageWindowStatus.downgraded}
                            <span class="rounded bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                {t('toolbar.costMode')}
                            </span>
                        {/if}
                </div>
                <p>{t('toolbar.perUser')}: <span class="font-mono">{usageWindowStatus.userBar}</span> {usageWindowStatus.userUsed}/{usageWindowStatus.userMax} ({usageWindowStatus.userWindowMinutes}m)</p>
                <p>{t('toolbar.perChat')}: <span class="font-mono">{usageWindowStatus.chatBar}</span> {usageWindowStatus.chatUsed}/{usageWindowStatus.chatMax} ({usageWindowStatus.chatWindowMinutes}m)</p>
            </div>
        {/if}

        <div class="grid gap-3" class:md:grid-cols-3={canViewGlobal} class:md:grid-cols-2={!canViewGlobal}>
            {#if canViewGlobal}
                <div class="space-y-2">
                    <Label>{t('toolbar.scope')}</Label>
                    <div class="grid grid-cols-2 gap-2">
                        <Button variant={scope === 'chat' ? 'default' : 'outline'} onclick={() => (scope = 'chat')}>{t('toolbar.scopeChat')}</Button>
                        <Button variant={scope === 'global' ? 'default' : 'outline'} onclick={() => (scope = 'global')}>{t('toolbar.scopeGlobal')}</Button>
                    </div>
                </div>
            {/if}

            {#if scope === 'chat'}
                <div class="space-y-2">
                    <Label for="chat-id">{t('toolbar.chat')}</Label>
                    {#if availableChats.length === 0}
                        <div
                            id="chat-id"
                            class="flex h-9 w-full items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground"
                        >
                            {t('toolbar.noChats')}
                        </div>
                    {:else}
                        <Input
                            type="search"
                            bind:value={chatSearch}
                            placeholder={t('toolbar.searchChatsPlaceholder')}
                            autocomplete="off"
                        />
                        {#if filteredChats.length === 0}
                            <div
                                class="flex h-9 w-full items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground"
                            >
                                {t('toolbar.noChatsMatch')}
                            </div>
                        {:else}
                            <Select.Root
                                type="single"
                                value={chatId}
                                onValueChange={handleChatChange}
                                disabled={isReloading || isLoading}
                            >
                                <Select.Trigger id="chat-id" class="w-full" aria-label={t('toolbar.selectChatAria')}>
                                    <span class="line-clamp-1 text-left">{selectedChatLabel}</span>
                                </Select.Trigger>
                                <Select.Content>
                                    {#each filteredChats as chat (chat.id)}
                                        <Select.Item value={String(chat.id)} label={chat.title}>
                                            {chat.title}{chat.username ? ` (@${chat.username})` : ''}
                                        </Select.Item>
                                    {/each}
                                </Select.Content>
                            </Select.Root>
                        {/if}
                    {/if}
                </div>
            {/if}

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
