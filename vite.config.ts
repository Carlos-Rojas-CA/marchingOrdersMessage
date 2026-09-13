// `vitest/config` re-exports Vite's defineConfig widened with the `test` block,
// so one config file drives both the dev server and the test runner.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Published at https://carlos-rojas-ca.github.io/marchingOrdersMessage/, so
// every asset URL and the service worker scope hang off this prefix. Overridable
// for local preview and for anyone hosting it elsewhere.
const base = process.env.BASE_PATH ?? '/marchingOrdersMessage/';

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // The document viewer pulls in a PDF renderer that must never land in the
    // initial bundle. Keeping it a separate chunk makes that visible in the
    // build output instead of silently regressing.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('pdfjs-dist')) return 'pdf-viewer';
          // One chunk for the whole builder rather than four: they are always
          // entered together, and four round trips to open a form is worse
          // than one slightly larger file.
          if (/routes\/(RouteScreen|LegsScreen|ItemFormScreen|ImportScreen)/.test(id)) {
            return 'builder';
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
