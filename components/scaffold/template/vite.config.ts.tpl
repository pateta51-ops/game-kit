import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Ports come from game-kit ports.json (entry "{{id}}"): dev = block, preview = block + 1. Change them there first.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: {{dev}}, strictPort: true },
  preview: { port: {{preview}}, strictPort: true, allowedHosts: ['.ts.net'], headers: { 'Cache-Control': 'no-cache' } },
});
