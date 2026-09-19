import { defineConfig } from 'vite';

/** Builds scripts/generate-catalog-import.ts for Node, like the tests are built. */
export default defineConfig({
  logLevel: 'warn',
  publicDir: false,
  build: {
    ssr: true,
    outDir: '.import-dist',
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: {
        'generate-catalog-import': 'scripts/generate-catalog-import.ts',
        'verify-remote-catalog': 'scripts/verify-remote-catalog.ts',
      },
      output: { format: 'es', entryFileNames: '[name].js' },
    },
  },
});
