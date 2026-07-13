import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'tests/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Los catch vacíos intencionales usan (_) — el patrón del proyecto para
      // operaciones best-effort (logging, cleanup) que no deben romper el flujo
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // El CLI imprime por consola por diseño — la regla no aplica a esta clase de app
      'no-console': 'off',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
  {
    ignores: ['node_modules/', 'coverage/'],
  },
];
