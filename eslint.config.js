import js from '@eslint/js'
import tseslint from 'typescript-eslint'

/**
 * The rules that matter here are the core-purity ones.
 *
 * tsconfig.core.json already makes `document` a compile error by omitting the
 * DOM lib, and tests/purity.spec.ts is the real gate in CI. These rules exist
 * so the feedback arrives in the editor, at the moment the mistake is made,
 * rather than after a test run.
 */
export default tseslint.config(
  { ignores: ['dist/**', '.tsbuild/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'The core has no clock. The tick count is the time.' },
        { name: 'performance', message: 'Only platform/ may read a wall clock.' },
        { name: 'document', message: 'The core is DOM-free.' },
        { name: 'window', message: 'The core is DOM-free.' },
        { name: 'localStorage', message: 'The core does not persist anything.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use rng.ts, seeded from World state.' },
        { object: 'Math', property: 'sin', message: 'Float results differ between engines. Use lutSin.' },
        { object: 'Math', property: 'cos', message: 'Float results differ between engines. Use lutCos.' },
        { object: 'Math', property: 'sqrt', message: 'Use isqrt for deterministic integer results.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          // The tick is fixed at 20 ms. A delta-time parameter reaching the
          // simulation is how frame-rate dependence sneaks back in.
          selector: "TSTypeAnnotation > TSTypeReference[typeName.name='HTMLElement']",
          message: 'The core is DOM-free.',
        },
      ],
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // The service worker runs in a worker scope, not a window.
    files: ['public/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly', caches: 'readonly', fetch: 'readonly',
        URL: 'readonly', location: 'readonly', clients: 'readonly',
        Response: 'readonly', Request: 'readonly',
      },
    },
  },
  {
    // Dev scripts run in Node but contain page.evaluate bodies that run in a
    // browser, so both sets of globals are legitimately in scope here.
    files: ['tools/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly', console: 'readonly',
        document: 'readonly', window: 'readonly', location: 'readonly',
        localStorage: 'readonly', URLSearchParams: 'readonly',
      },
    },
  },
  {
    files: ['tests/**/*.ts'],
    languageOptions: { globals: { structuredClone: 'readonly', console: 'readonly' } },
  },
)
