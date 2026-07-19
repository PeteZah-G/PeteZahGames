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
      "/api/alt-wisp-4": {
        target: "ws://localhost:8080",
        changeOrigin: true,
        ws: true,
      },
      "/api/alt-wisp-5": {
        target: "ws://localhost:8080",
        changeOrigin: true,
        ws: true,
      },
      "/afsd123k2": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/q9vx": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/m4thx": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/e7px": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/l9cx": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/api/edge": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/1k123.js": {
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
