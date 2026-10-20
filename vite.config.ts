import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' : chemins relatifs, le build fonctionne aussi bien sur Vercel qu'à la racine
// d'un dépôt GitHub Pages (https://<user>.github.io/<repo>/).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          globe: ['react-globe.gl'],
          charts: ['recharts'],
        },
      },
    },
  },
});
