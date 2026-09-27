import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // Relative asset paths: the site works from any sub-path (GitHub Pages /bedroom-360/).
  base: './',
  server: { port: 5180, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'), // interactive 3D walkthrough
        tour: resolve(__dirname, 'tour/index.html'), // lightweight 360 tour (share link)
      },
    },
  },
});
