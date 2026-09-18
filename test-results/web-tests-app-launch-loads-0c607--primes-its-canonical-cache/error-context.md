# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: web/tests/app.spec.ts >> launch loads the backend default and primes its canonical cache
- Location: web/tests/app.spec.ts:82:1

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/tests/harness.html", waiting until "load"

```

# Test source

```ts
  1   | import { expect, type Page, type Route, test } from '@playwright/test';
  2   | import type { ConfigResponse } from '../../shared/config-contract.ts';
  3   | 
  4   | declare global {
  5   |     interface Window {
  6   |         __settingsBack?: () => void;
  7   |         __settingsMain?: () => void;
  8   |     }
  9   | }
  10  | 
  11  | const personal = {
  12  |     scope: 'personal',
  13  |     fields: [{
  14  |         key: 'profile.about',
  15  |         kind: 'text',
  16  |         value: '',
  17  |         maxLength: 4000,
  18  |         overridden: false,
  19  |         writable: true,
  20  |     }],
  21  |     scopes: ['personal', 'private', 'global'],
  22  |     chats: [{ id: 7, title: 'Test chat', type: 'private' }],
  23  |     isAdmin: true,
  24  | } satisfies ConfigResponse;
  25  | 
  26  | const scoped = {
  27  |     scope: 'private',
  28  |     chatId: 7,
  29  |     fields: [
  30  |         {
  31  |             key: 'names',
  32  |             kind: 'text',
  33  |             value: 'Slusha',
  34  |             overridden: true,
  35  |             writable: true,
  36  |             inheritedValue: 'Assistant',
  37  |         },
  38  |         {
  39  |             key: 'responseDelay',
  40  |             kind: 'number',
  41  |             value: 2,
  42  |             min: 0,
  43  |             max: 30,
  44  |             overridden: false,
  45  |             writable: true,
  46  |         },
  47  |     ],
  48  |     scopes: ['personal', 'private'],
  49  |     chats: [{ id: 7, title: 'Test chat', type: 'private' }],
  50  |     isAdmin: true,
  51  | } satisfies ConfigResponse;
  52  | 
  53  | function harness(page: Page) {
> 54  |     return page.goto('/tests/harness.html');
      |                 ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  55  | }
  56  | 
  57  | async function routeConfig(
  58  |     page: Page,
  59  |     response: ConfigResponse = personal,
  60  | ) {
  61  |     const requests: string[] = [];
  62  |     await page.route('**/api/config**', async (route: Route) => {
  63  |         if (route.request().method() === 'PUT') {
  64  |             await route.fulfill({ json: response });
  65  |             return;
  66  |         }
  67  |         requests.push(route.request().url());
  68  |         const url = new URL(route.request().url());
  69  |         if (url.searchParams.get('scope') === 'private') {
  70  |             await route.fulfill({ json: scoped });
  71  |             return;
  72  |         }
  73  |         await route.fulfill({ json: response });
  74  |     });
  75  |     return requests;
  76  | }
  77  | 
  78  | function nativeBack(page: Page) {
  79  |     return page.evaluate(() => window.__settingsBack?.());
  80  | }
  81  | 
  82  | test('launch loads the backend default and primes its canonical cache', async ({ page }) => {
  83  |     const requests = await routeConfig(page);
  84  |     await harness(page);
  85  |     await expect(page.getByRole('heading', { name: 'Slusha Settings' }))
  86  |         .toBeVisible();
  87  |     expect(new URL(requests[0]).search).toBe('');
  88  |     expect(new URL(page.url()).searchParams.get('scope')).toBe('personal');
  89  |     expect(requests).toHaveLength(1);
  90  | });
  91  | 
  92  | test('typing in an editor keeps focus and saves the canonical response without GET', async ({ page }) => {
  93  |     const requests = await routeConfig(page, scoped);
  94  |     await page.goto('/tests/harness.html?scope=private&chatId=7');
  95  |     await page.getByRole('button', { name: 'Reply behavior' }).click();
  96  |     const input = page.getByLabel('Response delay');
  97  |     await input.click();
  98  |     await input.fill('');
  99  |     await input.pressSequentially('12');
  100 |     await expect(input).toBeFocused();
  101 |     await expect(page.getByRole('button', { name: /Save 1 change/ }))
  102 |         .toBeEnabled();
  103 |     await page.getByRole('button', { name: /Save 1 change/ }).click();
  104 |     await expect(input).toHaveValue('12');
  105 |     expect(requests).toHaveLength(1);
  106 | });
  107 | 
  108 | test('reset can be cancelled or saved and an editor is read-only while saving', async ({ page }) => {
  109 |     let resolveSave: (() => void) | undefined;
  110 |     await page.route('**/api/config**', async (route) => {
  111 |         if (route.request().method() === 'PUT') {
  112 |             await new Promise<void>((resolve) => resolveSave = resolve);
  113 |             await route.fulfill({ json: scoped });
  114 |             return;
  115 |         }
  116 |         await route.fulfill({ json: scoped });
  117 |     });
  118 |     await page.goto('/tests/harness.html?scope=private&chatId=7');
  119 |     await page.getByRole('button', { name: 'Reply behavior' }).click();
  120 |     await page.getByLabel('Revert Names to default').click();
  121 |     await page.getByRole('button', { name: 'Cancel' }).click();
  122 |     await expect(page.getByRole('textbox', { name: 'Names' })).toHaveValue(
  123 |         'Slusha',
  124 |     );
  125 |     await page.getByLabel('Revert Names to default').click();
  126 |     await page.getByRole('button', { name: 'Revert', exact: true }).click();
  127 |     await page.getByRole('button', { name: /Save 1 change/ }).click();
  128 |     await expect(page.getByRole('textbox', { name: 'Names' })).toBeDisabled();
  129 |     resolveSave?.();
  130 |     await expect(page.getByRole('textbox', { name: 'Names' })).toBeEnabled();
  131 | });
  132 | 
  133 | test('dirty scope navigation offers stay, discard, and save', async ({ page }) => {
  134 |     const requests = await routeConfig(page, personal);
  135 |     await page.goto('/tests/harness.html?scope=personal');
  136 |     await page.getByRole('button', { name: 'Private Chats Options' }).click();
  137 |     await page.getByRole('button', { name: 'Test chat', exact: true }).click();
  138 |     await expect(page.getByRole('heading', { name: 'Test chat' }))
  139 |         .toBeVisible();
  140 |     await page.getByRole('button', { name: 'Reply behavior' }).click();
  141 |     await page.getByRole('textbox', { name: 'Names' }).fill('draft');
  142 |     await nativeBack(page);
  143 |     await page.goBack();
  144 |     await expect(page.getByRole('heading', { name: 'Reply behavior' }))
  145 |         .toBeVisible();
  146 |     await page.goBack();
  147 |     await expect(page.getByRole('heading', { name: 'Test chat' }))
  148 |         .toBeVisible();
  149 |     await page.goBack();
  150 |     await expect(page.getByRole('button', { name: /Discard changes/ }))
  151 |         .toBeVisible();
  152 |     await page.getByRole('button', { name: 'Stay' }).click();
  153 |     await nativeBack(page);
  154 |     await expect(page.getByRole('button', { name: /Discard changes/ }))
```