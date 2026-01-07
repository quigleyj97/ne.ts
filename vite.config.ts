import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import dts from 'vite-plugin-dts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode, command }) => ({
  plugins: command === 'build' && mode === 'demo' ? [] : [
    dts({
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'test/**/*'],
      rollupTypes: true
    })
  ],

  // Configure library build mode (skip for demo builds)
  build: command === 'build' && mode === 'demo' ? {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
  } : {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'NeTs',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`
    },
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      // Externalize dependencies that shouldn't be bundled
      external: [],
      output: {
        // Preserve module structure for better tree-shaking
        preserveModules: false,
      },
      input: {
        main: resolve(__dirname, 'src/index.ts'),
        // AudioWorklet processor as separate entry
        'worklet/processor': resolve(__dirname, 'src/devices/apu/audio/worklet-processor.ts')
      }
    },
    // Target modern browsers
    target: 'esnext',
  },
  
  // Set demo as root for dev server and demo builds (but not for tests or lib builds)
  root: mode === 'test' ? __dirname : 'demo',
  publicDir: mode === 'test' ? false : (mode === 'demo' ? 'public' : '../roms'),
  base: mode === 'demo' ? '/ne.ts/' : undefined,
  
  // Dev server configuration for demo
  server: {
    port: 3000,
  },
  
  // Resolve configuration
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    }
  },
  
  // Vitest configuration
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/devices/apu/audio/worklet-processor.ts', // Separate context
      ]
    }
  }
}));
