import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['fake-indexeddb/auto'],
    environmentOptions: {
      happyDOM: {
        settings: {
          disableIframePageLoading: false,
        },
      },
    },
    globals: true,
  },
});
