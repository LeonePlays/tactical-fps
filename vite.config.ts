import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@babylonjs')) return 'babylon';
        },
      },
    },
    // Babylon includes a complete WebGL engine; keep it in a separately cached chunk.
    chunkSizeWarningLimit: 1800,
  },
});
