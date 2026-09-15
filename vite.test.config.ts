import { readdirSync } from 'node:fs';
import { defineConfig } from 'vite';

/**
 * Builds the tests in tests/ for Node, so they run with the built-in
 * `node --test` without adding a test framework. `npm test` builds and runs.
 */
const testFiles = readdirSync('tests').filter((file) => file.endsWith('.test.ts'));

export default defineConfig({
  logLevel: 'warn',
  // Tests don't need the app's static files copied next to them.
  publicDir: false,
  build: {
    ssr: true,
    outDir: '.test-dist',
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: Object.fromEntries(testFiles.map((file) => [file.replace(/\.ts$/, ''), `tests/${file}`])),
      output: { format: 'es', entryFileNames: '[name].js' },
    },
  },
});
