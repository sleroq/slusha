<script lang="ts">
    import { onMount } from "svelte";

    onMount(() => {
        console.log("Telegram web app init data:");
        console.log(Telegram.WebApp.initData);
    });
</script>

<h1>Welcome to SvelteKit</h1>
<p>
    Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the
    documentation
</p>
