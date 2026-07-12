<script lang="ts">
    import "./layout.css";
    import favicon from "$lib/assets/favicon.svg";

    let { children } = $props();
</script>

<svelte:head>
    <link rel="icon" href={favicon} />
    <script src="https://telegram.org/js/telegram-web-app.js?62"></script>
</svelte:head>

{@render children()}
