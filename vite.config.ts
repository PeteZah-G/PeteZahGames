import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  renameSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { componentTagger } from "lovable-tagger";

function gameAssetsPassthrough(): Plugin {
  const root = path.resolve(__dirname);
  const src = path.join(root, "public/storage/ag");
  const dest = path.join(root, "dist/storage/ag");
  const parkPublic = path.join(root, ".tmp-ag-assets");
  let publicParked = false;

  const restorePublic = () => {
    if (!existsSync(parkPublic)) {
      publicParked = false;
      return;
    }
    if (!existsSync(src)) {
      mkdirSync(path.dirname(src), { recursive: true });
      renameSync(parkPublic, src);
    }
    publicParked = false;
  };

  const parkPublicDir = () => {
    if (publicParked && existsSync(parkPublic) && !existsSync(src)) return;
    restorePublic();
    if (!existsSync(src)) return;
    mkdirSync(path.dirname(parkPublic), { recursive: true });
    renameSync(src, parkPublic);
    publicParked = true;
  };

  const parkDistDir = () => {
    if (!existsSync(dest)) return;
    try {
      if (lstatSync(dest).isSymbolicLink()) {
        unlinkSync(dest);
        return;
      }
    } catch {}
    const parked = existsSync(path.join(root, ".tmp-ag-dist"))
      ? path.join(root, `.tmp-ag-dist-${Date.now()}`)
      : path.join(root, ".tmp-ag-dist");
    mkdirSync(path.dirname(parked), { recursive: true });
    renameSync(dest, parked);
    spawn("rm", ["-rf", parked], { detached: true, stdio: "ignore" }).unref();
  };

  const linkIntoDist = () => {
    restorePublic();
    if (!existsSync(src)) return;
    mkdirSync(path.dirname(dest), { recursive: true });
    parkDistDir();
    symlinkSync(path.relative(path.dirname(dest), src), dest, "dir");
  };

  return {
    name: "game-assets-passthrough",
    apply: "build",
    enforce: "pre",
    config() {
      process.once("exit", restorePublic);
      process.once("SIGINT", () => {
        restorePublic();
      });
      process.once("SIGTERM", () => {
        restorePublic();
      });
      parkPublicDir();
      parkDistDir();
    },
    buildStart() {
      parkPublicDir();
      parkDistDir();
    },
    buildEnd() {
      restorePublic();
    },
    closeBundle() {
      linkIntoDist();
    },
  };
}

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
      "/api/wisp-tor": {
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
  plugins: [gameAssetsPassthrough(), react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
