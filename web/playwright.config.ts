import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    use: {
        baseURL: 'http://127.0.0.1:52789',
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'bun run dev --host 127.0.0.1 --port 52789 --strictPort',
        url: 'http://127.0.0.1:52789',
        reuseExistingServer: false,
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ],
});
