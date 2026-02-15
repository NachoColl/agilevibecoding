import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy API requests to backend server
      '/api': {
        target: 'http://localhost:4174',
        changeOrigin: true,
      },
      // Proxy WebSocket requests
      '/ws': {
        target: 'ws://localhost:4174',
        ws: true,
      },
    },
  },
});
