/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Same paths as nginx in production (web/nginx.conf).
    proxy: {
      '/api': 'http://localhost:3000',
      '/webrtc': {
        target: 'http://localhost:8889',
        rewrite: (path) => path.replace(/^\/webrtc/, ''),
      },
      '/hls': { target: 'http://localhost:8888', rewrite: (path) => path.replace(/^\/hls/, '') },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
  },
});
