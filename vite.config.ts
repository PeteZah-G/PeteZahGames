import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 3000,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/wisp": {
        target: "ws://localhost:8080",
        changeOrigin: true,
        ws: true,
      },
      "/api/alt-wisp-1": {
        target: "ws://localhost:8080",
        changeOrigin: true,
        ws: true,
      },
      "/api/alt-wisp-2": {
        target: "ws://localhost:8080",
        changeOrigin: true,
        ws: true,
      },
      "/api/alt-wisp-3": {
        target: "ws://localhost:8080",
        changeOrigin: true,
        ws: true,
      },
      "/scramjet": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/scram": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/baremux": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/epoxy": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/libcurl": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/bare": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/sw.js": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));