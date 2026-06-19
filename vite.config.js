import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/marked/')) return 'vendor-marked';
          if (id.includes('/src/console/report-export.js')) return 'console-report-export';
          if (id.includes('/src/benchmarks/') || id.includes('/src/v2/')) return 'benchmark-runtime';
          return null;
        },
      },
    },
  },
  server: {
    port: 4173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});
