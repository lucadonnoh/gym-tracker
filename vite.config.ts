import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  root: 'src/frontend',
  build: {
    outDir: '../../public',
    emptyOutDir: false,
    rollupOptions: {
      input: 'src/frontend/index.html',
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
