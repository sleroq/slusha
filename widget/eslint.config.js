import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';

export default [
    {
        ignores: ['dist/**', 'node_modules/**'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    ...svelte.configs['flat/recommended'],
    {
        files: ['**/*.ts', '**/*.svelte.ts'],
        languageOptions: {
            parser: tseslint.parser,
        },
        rules: {
            'no-undef': 'off',
        },
    },
    {
        files: ['**/*.svelte'],
        languageOptions: {
            parser: svelteParser,
            parserOptions: {
                parser: tseslint.parser,
                extraFileExtensions: ['.svelte'],
            },
        },
        rules: {
            'no-undef': 'off',
        },
    },
];
