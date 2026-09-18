import tailwindcss from '@tailwindcss/vite';
import solid from '@solidjs/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
    plugins: [tailwindcss(), solid({ diagnostics: mode !== 'production' })],
    publicDir: 'static',
    server: {
        hmr: { host: '127.0.0.1', clientPort: 5173 },
    },
    resolve: {
        dedupe: ['solid-js', '@solidjs/web'],
    },
    build: {
        outDir: 'build',
        emptyOutDir: true,
    },
}));
