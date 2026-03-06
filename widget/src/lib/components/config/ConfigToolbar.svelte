<script lang="ts">
    import { Button } from '$lib/components/ui/button';
    import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
    import { Label } from '$lib/components/ui/label';
    import type {
        AvailableChat,
        ConfigRole,
        ConfigScope,
    } from '$lib/config/model';

    function formatCategory(category: string): string {
        return category.charAt(0).toUpperCase() + category.slice(1);
    }

    interface Props {
        scope: ConfigScope;
        chatId: string;
        status: string;
        canViewGlobal: boolean;
        role: ConfigRole;
        categories: string[];
        availableChats: AvailableChat[];
        onReload: () => void;
    }

    let {
        scope = $bindable(),
        chatId = $bindable(),
        status,
        canViewGlobal,
        role,
        categories,
        availableChats,
        onReload,
    }: Props = $props();
</script>

<Card>
    <CardHeader>
        <CardTitle>Slusha Config</CardTitle>
        <CardDescription>Widget configured with shadcn-svelte components.</CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
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
                    <select
                        id="chat-id"
                        bind:value={chatId}
                        class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm"
                    >
                        {#if availableChats.length === 0}
                            <option value="" disabled>No chats available</option>
                        {:else}
                            {#each availableChats as chat (chat.id)}
                                <option value={String(chat.id)}>
                                    {chat.title}{chat.username ? ` (@${chat.username})` : ''}
                                </option>
                            {/each}
                        {/if}
                    </select>
                </div>
            {/if}

            <div class="flex items-end">
                <Button class="w-full" onclick={onReload}>Reload</Button>
            </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span class="rounded-full border px-2 py-1 font-medium text-foreground">Role: {role}</span>
            {#each categories as category (category)}
                <span class="rounded-full border px-2 py-1">{formatCategory(category)}</span>
            {/each}
        </div>

        <p class="text-sm text-muted-foreground">{status}</p>
    </CardContent>
</Card>
