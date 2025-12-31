import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  // Set demo as root for building the demo site
  root: 'demo',
  base: '/ne.ts/',
  publicDir: 'public',
  
  build: {
    outDir: resolve(__dirname, 'demo-dist'),
    emptyOutDir: true,
    // Target modern browsers
    target: 'esnext',
    // Copy test data to the build output
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name].[hash][extname]'
      }
    }
  },
  
  // Resolve configuration
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    }
  },
});
