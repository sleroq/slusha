<script lang="ts">
    import { Button } from '$lib/components/ui/button';
    import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import type { ConfigRole, ConfigScope } from '$lib/config/model';

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
        onReload: () => void;
    }

    let {
        scope = $bindable(),
        chatId = $bindable(),
        status,
        canViewGlobal,
        role,
        categories,
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

            <div class="space-y-2">
                <Label for="chat-id">Chat ID</Label>
                <Input id="chat-id" bind:value={chatId} />
            </div>

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
