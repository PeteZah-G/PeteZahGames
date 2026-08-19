import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { componentTagger } from "lovable-tagger";

function gameAssetsPassthrough(mode: string): Plugin {
  const root = path.resolve(__dirname);
  const src = path.join(root, "public/storage/ag");
  const dest = path.join(root, "dist/storage/ag");
  const parkPublic = path.join(root, ".tmp-ag-assets");
  let publicParked = false;
  const skip = mode === "svg";

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
      if (skip) return;
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
      if (skip) return;
      parkPublicDir();
      parkDistDir();
    },
    buildEnd() {
      if (skip) return;
      restorePublic();
    },
    closeBundle() {
      if (skip) return;
      linkIntoDist();
    },
  };
}

function banEngineTokens(): Plugin {
  let outDir = "dist";
  const banned = [/scramjet/i, /ultraviolet/i, /\/wisp\//i, /wisp-tor/i, /alt-wisp/i, /BareMux/, /setTransport/, /epoxy/i, /libcurl/i, /baremuxinit/];
  return {
    name: "ban-engine-tokens",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const assets = path.resolve(outDir, "assets");
      if (!existsSync(assets)) return;
      const hits: string[] = [];
      for (const name of readdirSync(assets)) {
        if (!/^index-.*\.js$/.test(name)) continue;
        const text = readFileSync(path.join(assets, name), "utf8");
        for (const re of banned) {
          if (re.test(text)) hits.push(`${name} ${re}`);
        }
      }
      if (hits.length) {
        throw new Error(`Compiled assets still contain blocked tokens:\n${hits.join("\n")}`);
      }
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
      "/api/websocket": {
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
  plugins: [gameAssetsPassthrough(mode), react(), banEngineTokens(), mode === "development" && componentTagger()].filter(Boolean),
  base: mode === "svg" ? "./" : "/",
  build: {
    outDir: mode === "svg" ? "svg" : "dist",
    emptyOutDir: true,
    assetsDir: "assets",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
