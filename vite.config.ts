import { defineConfig } from 'vite'

// GitHub Pages project site lives at https://<user>.github.io/Project-Boshy/
// so every asset URL must be prefixed. This is the #1 cause of "works locally,
// blank page on Pages".
const base = process.env.GITHUB_ACTIONS ? '/Project-Boshy/' : '/'

export default defineConfig({
  base,
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    reportCompressedSize: true,
  },
  server: {
    host: true,
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
} as Parameters<typeof defineConfig>[0])
