import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": `http://127.0.0.1:${process.env.VITE_API_PORT ?? "8000"}` } },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
    // Noms courts : évite la limite de 260 caractères des chemins Windows (dossiers OneDrive profonds)
    rollupOptions: { output: { entryFileNames: "a/[hash:10].js", chunkFileNames: "a/[hash:10].js", assetFileNames: "a/[hash:10][extname]" } },
  },
  test: { environment: "node" },
});
