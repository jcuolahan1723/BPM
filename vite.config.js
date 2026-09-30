import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      // Catalogue data in its own file, so app-only changes don't re-download it.
      output: { manualChunks: (id) => (id.includes("catalogue-data") ? "catalogue" : undefined) },
    },
  },
});
