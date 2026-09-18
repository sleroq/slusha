import { expect, type Page, type Route, test } from '@playwright/test';
import type { ConfigResponse } from '../../shared/config-contract.ts';

const TEST_CONTRACT_VERSION = 1;

declare global {
    var __settingsBack: (() => void) | undefined;
    var __settingsMain: (() => void) | undefined;
    var __settingsChrome: {
        confirmClosing: boolean;
        backVisible: boolean;
        main: {
            text: string;
            visible: boolean;
            enabled: boolean;
            loading: boolean;
        };
    } | undefined;
}

const personal = {
    contractVersion: TEST_CONTRACT_VERSION,
    scope: 'personal',
    fields: [{
        key: 'profile.about',
        kind: 'text',
        value: '',
        maxLength: 4000,
        overridden: false,
        writable: true,
    }],
    scopes: ['personal', 'private', 'global'],
    chats: [{ id: 7, title: 'Test chat', type: 'private' }],
    isAdmin: true,
} satisfies ConfigResponse;

const scoped = {
    contractVersion: TEST_CONTRACT_VERSION,
    scope: 'private',
    chatId: 7,
    fields: [
        {
            key: 'names',
            kind: 'text',
            value: 'Slusha',
            overridden: true,
            writable: true,
            inheritedValue: 'Assistant',
        },
        {
            key: 'responseDelay',
            kind: 'number',
            value: 2,
            min: 0,
            max: 30,
            overridden: false,
            writable: true,
        },
        {
            key: 'ai.model',
            kind: 'select',
            options: ['fast', 'accurate'],
            value: 'fast',
            optional: true,
            inheritedValue: 'accurate',
            overridden: true,
            writable: true,
        },
    ],
    scopes: ['personal', 'private'],
    chats: [{ id: 7, title: 'Test chat', type: 'private' }],
    isAdmin: true,
} satisfies ConfigResponse;

function harness(page: Page) {
    return page.goto('/tests/harness.html');
}

async function routeConfig(
    page: Page,
    response: ConfigResponse = personal,
) {
    const requests: string[] = [];
    await page.route('**/api/config**', async (route: Route) => {
        if (route.request().method() === 'PUT') {
            const body = route.request().postDataJSON() as {
                operations?: Array<{
                    key: string;
                    reset?: boolean;
                    value?: unknown;
                }>;
            };
            const fields = response.fields.map((field) => {
                const operation = body.operations?.find((item) =>
                    item.key === field.key
                );
                if (!operation) return field;
                if (operation.reset) {
                    return {
                        ...field,
                        value: field.inheritedValue ?? field.value,
                        overridden: false,
                    };
                }
                return { ...field, value: operation.value };
            });
            await route.fulfill({ json: { ...response, fields } });
            return;
        }
        requests.push(route.request().url());
        const url = new URL(route.request().url());
        if (url.searchParams.get('scope') === 'private') {
            await route.fulfill({ json: scoped });
            return;
        }
        await route.fulfill({ json: response });
    });
    return requests;
}

function nativeBack(page: Page) {
    return page.evaluate(() => globalThis.__settingsBack?.());
}

function nativeMain(page: Page) {
    return page.evaluate(() => globalThis.__settingsMain?.());
}

test('launch loads the backend default and primes its canonical cache', async ({ page }) => {
    const requests = await routeConfig(page);
    await harness(page);
    await expect(page.getByRole('heading', { name: 'Slusha Settings' }))
        .toBeVisible();
    expect(new URL(requests[0]).search).toBe('');
    expect(new URL(page.url()).searchParams.get('scope')).toBe('personal');
    expect(requests).toHaveLength(1);
});

test('typing in an editor keeps focus and saves the canonical response without GET', async ({ page }) => {
    const requests = await routeConfig(page, scoped);
    await page.goto('/tests/harness.html?scope=private&chatId=7');
    await page.getByRole('button', { name: 'Reply behavior' }).click();
    const input = page.getByLabel('Response delay');
    await input.click();
    await input.fill('');
    await input.pressSequentially('12');
    await expect(input).toBeFocused();
    await expect.poll(() =>
        page.evaluate(() => globalThis.__settingsChrome?.main.enabled)
    ).toBe(true);
    await nativeMain(page);
    await expect(input).toHaveValue('12');
    expect(requests).toHaveLength(1);
});

test('reset can be cancelled or saved and an editor is read-only while saving', async ({ page }) => {
    let resolveSave: (() => void) | undefined;
    await page.route('**/api/config**', async (route) => {
        if (route.request().method() === 'PUT') {
            await new Promise<void>((resolve) => resolveSave = resolve);
            await route.fulfill({ json: scoped });
            return;
        }
        await route.fulfill({ json: scoped });
    });
    await page.goto('/tests/harness.html?scope=private&chatId=7');
    await page.getByRole('button', { name: 'Reply behavior' }).click();
    await page.getByLabel('Revert Names to default').click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('textbox', { name: 'Names' })).toHaveValue(
        'Slusha',
    );
    await page.getByLabel('Revert Names to default').click();
    await page.getByRole('button', { name: 'Revert', exact: true }).click();
    await nativeMain(page);
    await expect(page.getByRole('textbox', { name: 'Names' })).toBeDisabled();
    resolveSave?.();
    await expect(page.getByRole('textbox', { name: 'Names' })).toBeEnabled();
    await nativeBack(page);
    await page.getByRole('button', { name: 'Model and generation' }).click();
    await page.locator('button.selection').click();
    await page.getByRole('button', { name: 'Not set' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('body')).toHaveCSS('overflow', 'visible');
    await page.locator('button.selection').click();
    await page.getByRole('button', { name: 'Not set' }).click();
    await page.getByRole('button', { name: 'Revert', exact: true }).click();
    await page.getByRole('button', { name: 'Keep override' }).click();
    await expect(page.locator('body')).toHaveCSS('overflow', 'visible');
});

test('dirty scope navigation offers stay, discard, and save', async ({ page }) => {
    const requests = await routeConfig(page, personal);
    await page.goto('/tests/harness.html?scope=personal');
    await page.getByRole('button', { name: 'Private Chats Options' }).click();
    await page.getByRole('button', { name: 'Test chat', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Test chat' }))
        .toBeVisible();
    await page.getByRole('button', { name: 'Reply behavior' }).click();
    await page.getByRole('textbox', { name: 'Names' }).fill('draft');
    await nativeBack(page);
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Reply behavior' }))
        .toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Test chat' }))
        .toBeVisible();
    await page.goBack();
    await expect(page.getByRole('button', { name: /Discard changes/ }))
        .toBeVisible();
    await page.getByRole('button', { name: 'Stay' }).click();
    await nativeBack(page);
    await expect(page.getByRole('button', { name: /Discard changes/ }))
        .toBeVisible();
    await page.getByRole('button', { name: /Discard changes/ }).click();
    await expect(page.getByRole('heading', { name: 'Slusha Settings' }))
        .toBeVisible();
    expect(requests.length).toBeGreaterThanOrEqual(1);
});

test('cached revisit restores the draft without a fresh request', async ({ page }) => {
    const requests = await routeConfig(page, scoped);
    await page.goto('/tests/harness.html?scope=private&chatId=7');
    await page.getByRole('button', { name: 'Reply behavior' }).click();
    const input = page.getByLabel('Response delay');
    await input.fill('9');
    await nativeBack(page);
    await page.getByRole('button', { name: 'Reply behavior' }).click();
    await expect(page.getByLabel('Response delay')).toHaveValue('9');
    expect(requests).toHaveLength(1);
});

test('invalid numeric input remains visible across local routes and blocks save', async ({ page }) => {
    await routeConfig(page, scoped);
    await page.goto('/tests/harness.html?scope=private&chatId=7');
    await page.getByRole('button', { name: 'Reply behavior' }).click();
    const input = page.getByLabel('Response delay');
    await input.fill('not-a-number');
    await nativeBack(page);
    await page.getByRole('button', { name: 'Reply behavior' }).click();
    await expect(page.getByLabel('Response delay')).toHaveValue('not-a-number');
    await expect.poll(() =>
        page.evaluate(() => globalThis.__settingsChrome?.main.enabled)
    ).toBe(false);
    await input.fill('4');
    await expect.poll(() =>
        page.evaluate(() => globalThis.__settingsChrome?.main.enabled)
    ).toBe(true);
});

test('a failed save preserves the draft and exposes a retry', async ({ page }) => {
    let saves = 0;
    await page.route('**/api/config**', async (route: Route) => {
        if (route.request().method() === 'PUT') {
            saves += 1;
            if (saves === 1) {
                await route.fulfill({
                    status: 500,
                    contentType: 'text/plain',
                    body: 'temporary failure',
                });
                return;
            }
            await route.fulfill({ json: scoped });
            return;
        }
        await route.fulfill({ json: scoped });
    });
    await page.goto('/tests/harness.html?scope=private&chatId=7');
    await page.getByRole('button', { name: 'Reply behavior' }).click();
    const input = page.getByLabel('Response delay');
    await input.fill('8');
    await nativeMain(page);
    await expect(input).toHaveValue('8');
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect.poll(() => saves).toBe(2);
    await expect(input).toHaveValue('2');
});

test('a mismatched contract response preserves the draft and shows an error', async ({ page }) => {
    let saves = 0;
    await page.route('**/api/config**', async (route: Route) => {
        if (route.request().method() === 'PUT') {
            saves += 1;
            await route.fulfill({
                json: {
                    ...scoped,
                    contractVersion: TEST_CONTRACT_VERSION + 1,
                },
            });
            return;
        }
        await route.fulfill({ json: scoped });
    });
    await page.goto('/tests/harness.html?scope=private&chatId=7');
    await page.getByRole('button', { name: 'Reply behavior' }).click();
    const input = page.getByLabel('Response delay');
    await input.fill('8');
    await nativeMain(page);
    await expect(page.getByText(
        'The settings response does not match this app. Please reload or retry.',
    )).toBeVisible();
    await expect(input).toHaveValue('8');
    expect(saves).toBe(1);
});

test('native modal back works and browser scope navigation is blocked during save', async ({ page }) => {
    let resolveSave: (() => void) | undefined;
    await page.route('**/api/config**', async (route: Route) => {
        if (route.request().method() === 'PUT') {
            await new Promise<void>((resolve) => resolveSave = resolve);
            await route.fulfill({ json: scoped });
            return;
        }
        const url = new URL(route.request().url());
        if (url.searchParams.get('scope') === 'private') {
            await route.fulfill({ json: scoped });
            return;
        }
        await route.fulfill({ json: personal });
    });
    await page.goto('/tests/harness.html?scope=personal');
    await page.getByRole('button', { name: 'Private Chats Options' }).click();
    await expect.poll(() =>
        page.evaluate(() => globalThis.__settingsChrome?.backVisible)
    ).toBe(true);
    await nativeBack(page);
    await expect(page.getByRole('button', { name: 'Test chat', exact: true }))
        .toHaveCount(0);
    await page.getByRole('button', { name: 'Private Chats Options' }).click();
    await page.getByRole('button', { name: 'Test chat', exact: true }).click();
    await page.getByRole('button', { name: 'Reply behavior' }).click();
    const input = page.getByLabel('Response delay');
    await input.fill('8');
    await nativeMain(page);
    await expect(input).toBeDisabled();
    await page.evaluate(() => {
        history.pushState({}, '', '/?scope=personal');
        dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page).toHaveURL(/scope=private/);
    await expect(page.getByRole('heading', { name: 'Reply behavior' }))
        .toBeVisible();
    resolveSave?.();
    await expect(input).toBeEnabled();
});
