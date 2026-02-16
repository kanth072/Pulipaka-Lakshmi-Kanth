import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // This correctly replaces process.env.API_KEY with the value from your Vercel settings
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY || ''),
  },
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
    sourcemap: false, // Set to false for cleaner production builds
  },
});