import MyrotvoretsConfig from '@myrotvorets/eslint-config-myrotvorets-ts';
import MochaPlugin from 'eslint-plugin-mocha';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
    {
        ignores: ['**/*.js', '**/*.d.ts'],
    },
    ...MyrotvoretsConfig,
    MochaPlugin.configs.recommended,
    {
        languageOptions: {
            globals: {
                ...globals.mocha,
            },
        },
    },
];
