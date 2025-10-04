// client/eslint.config.js
import js from '@eslint/js'
import ts from 'typescript-eslint'
import svelte from 'eslint-plugin-svelte'
import svelteParser from 'svelte-eslint-parser'

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: { ...js.configs.recommended.rules }
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: ts.parser, parserOptions: { project: false } },
    plugins: { '@typescript-eslint': ts.plugin },
    rules: { ...ts.configs.recommended.rules }
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: { parser: ts.parser }
    },
    plugins: { svelte },
    rules: { ...svelte.configs['flat/recommended'].rules }
  }
]