import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { allowedHosts } from './src/request-guard';

export default defineConfig({
  root: 'client',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    // compose sets 0.0.0.0 so the port is reachable from the host; locally it stays private.
    host: process.env.UNION_DEV_HOST ?? 'localhost',
    port: 5173,
    strictPort: true,
    // The same host names as the API's guard, so `UNION_ALLOWED_HOSTS` opens the page too.
    allowedHosts: [...allowedHosts()],
    // Hono listens on IPv4 loopback only (`localhost` may resolve to ::1 first). The browser's Host
    // is kept: the API checks the request's origin against it.
    proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false } },
  },
});
