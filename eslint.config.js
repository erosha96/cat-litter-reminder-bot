import js from '@eslint/js';
import globals from 'globals';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';

export default defineConfig([
	{
		files: ['**/*.{js,mjs,cjs}'],
		plugins: { js, prettier: prettierPlugin },
		extends: ['js/recommended'],
		rules: {
			'prettier/prettier': 'error',
		},
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
	},
	{
		files: ['**/*.{js,mjs,cjs}'],
	},
	prettierConfig,
]);
