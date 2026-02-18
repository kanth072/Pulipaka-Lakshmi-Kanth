import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'API_'],
  define: {
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY || process.env.VITE_API_KEY || ''),
    'import.meta.env.API_KEY': JSON.stringify(process.env.API_KEY || process.env.VITE_API_KEY || ''),
  },
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          genai: ['@google/genai'],
        },
      },
    },
  },
});
