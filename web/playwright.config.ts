import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    use: {
        baseURL: 'http://127.0.0.1:5173',
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'deno task dev --host 127.0.0.1',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: true,
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ],
});
