/// <reference types="vitest" />
import { loadEnv } from 'vite';
import { staticPages } from './build/staticPages.ts';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => ({
  server: {
    host: '127.0.0.1',
    port: 8080,
  },
  plugins: [react(), tailwindcss(), staticPages(loadEnv(mode, process.cwd(), ''))],
  build: { sourcemap: false },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: true,
  },
}));
