import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During development the API runs on :5000 and Vite forwards /api calls to it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:5000' },
  },
});
