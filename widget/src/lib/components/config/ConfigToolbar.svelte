<script lang="ts">
    import { Button } from '$lib/components/ui/button';
    import { Label } from '$lib/components/ui/label';
    import * as Select from '$lib/components/ui/select';
    import type {
        AvailableChat,
        ConfigRole,
        ConfigScope,
    } from '$lib/config/model';

    interface Props {
        scope: ConfigScope;
        chatId: string;
        status: string;
        canViewGlobal: boolean;
        role: ConfigRole;
        availableChats: AvailableChat[];
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
        onReload,
        isReloading = false,
        isLoading = false,
    }: Props = $props();

    let selectedChatLabel = $derived.by(() => {
        const selected = availableChats.find((chat) => String(chat.id) === chatId);
        if (!selected) {
            return availableChats.length > 0 ? 'Select a chat' : 'No chats available';
        }

        return selected.username
            ? `${selected.title} (@${selected.username})`
            : selected.title;
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
        <h1 class="text-xl font-semibold">Slusha Config</h1>
        <span class="rounded-full border px-2 py-1 text-xs font-medium text-foreground">Role: {role}</span>
    </div>

    <div class="space-y-4">
        <div class="grid gap-3" class:md:grid-cols-3={canViewGlobal} class:md:grid-cols-2={!canViewGlobal}>
            {#if canViewGlobal}
                <div class="space-y-2">
                    <Label>Scope</Label>
                    <div class="grid grid-cols-2 gap-2">
                        <Button variant={scope === 'chat' ? 'default' : 'outline'} onclick={() => (scope = 'chat')}>chat</Button>
                        <Button variant={scope === 'global' ? 'default' : 'outline'} onclick={() => (scope = 'global')}>global</Button>
                    </div>
                </div>
            {/if}

            {#if scope === 'chat'}
                <div class="space-y-2">
                    <Label for="chat-id">Chat</Label>
                    {#if availableChats.length === 0}
                        <div
                            id="chat-id"
                            class="flex h-9 w-full items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground"
                        >
                            No chats available
                        </div>
                    {:else}
                        <Select.Root
                            type="single"
                            value={chatId}
                            onValueChange={handleChatChange}
                            disabled={isReloading || isLoading}
                        >
                            <Select.Trigger id="chat-id" class="w-full" aria-label="Select chat">
                                <span class="line-clamp-1 text-left">{selectedChatLabel}</span>
                            </Select.Trigger>
                            <Select.Content>
                                {#each availableChats as chat (chat.id)}
                                    <Select.Item value={String(chat.id)} label={chat.title}>
                                        {chat.title}{chat.username ? ` (@${chat.username})` : ''}
                                    </Select.Item>
                                {/each}
                            </Select.Content>
                        </Select.Root>
                    {/if}
                </div>
            {/if}

            <div class="flex items-end">
                <Button class="w-full" onclick={onReload} disabled={isReloading || isLoading} aria-busy={isReloading}>
                    {isReloading ? 'Reloading...' : 'Reload'}
                </Button>
            </div>
        </div>

        <p class="text-sm text-muted-foreground" role="status" aria-live="polite">
            {#if isLoading}
                <span class="inline-flex items-center gap-2">
                    <span class="size-3 animate-spin rounded-full border-2 border-muted-foreground/35 border-t-foreground"></span>
                    Loading configuration...
                </span>
            {:else}
                {status}
            {/if}
        </p>
    </div>
</section>
