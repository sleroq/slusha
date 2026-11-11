import { defineConfig } from 'oxlint';
import solidV2 from 'eslint-plugin-solid/configs/v2';

export default defineConfig({
    jsPlugins: ['eslint-plugin-solid'],
    ignorePatterns: [
        '**/*.gen.*',
        '**/build/**',
        '**/dist/**',
        '**/target/**',
        '**/test-results/**',
        '**/playwright-report/**',
    ],
    categories: { correctness: 'error' },
    options: { typeAware: true },
    settings: solidV2.settings,
    rules: {
        'eslint/prefer-const': 'error',
        'eslint/eqeqeq': ['error', 'always', { null: 'ignore' }],
        'eslint/no-duplicate-imports': ['error', { allowSeparateTypeImports: true }],
        'typescript/consistent-type-imports': ['error', { disallowTypeAnnotations: false }],
        'typescript/no-floating-promises': 'error',
        'typescript/no-misused-promises': 'error',
        'typescript/await-thenable': 'error',
    },
    overrides: [
        {
            files: [
                'web/src/**/*.{ts,tsx}',
                'web/tests/**/*.{ts,tsx}',
                'packages/mini-app/src/**/*.{ts,tsx}',
            ],
            rules: solidV2.rules,
        },
    ],
});
