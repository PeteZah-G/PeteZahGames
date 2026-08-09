/**
 * PeteZah UI Studio — local GrapesJS visual editor.
 * Security: 127.0.0.1 only, random token, path whitelist, size caps.
 * SUPER EXPERIMENTAL, I'm just testing this out because I thought it was cool.
 *
 * Usage: npm run ui
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const HOST = "127.0.0.1";
const PORT = Number(process.env.UI_STUDIO_PORT || 5199);
const TOKEN = crypto.randomBytes(24).toString("hex");
const MAX_BODY = 1_500_000;

const ALLOWED_FILES = new Set([
  "src/styles/studio-overrides.css",
  "src/ui-studio/project.json",
  "src/ui-studio/home-shell.html",
  "src/ui-studio/ai-shell.html",
]);

function safeResolve(rel) {
  const normalized = String(rel || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!ALLOWED_FILES.has(normalized)) return null;
  const abs = path.resolve(ROOT, normalized);
  const rootWithSep = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (abs !== path.resolve(ROOT, normalized) || !abs.startsWith(rootWithSep)) {
    return null;
  }
  // Extra traversal guard
  if (abs.includes("..") || !abs.startsWith(ROOT)) return null;
  return abs;
}

function ensureDirs() {
  fs.mkdirSync(path.join(ROOT, "src/styles"), { recursive: true });
  fs.mkdirSync(path.join(ROOT, "src/ui-studio"), { recursive: true });
  const cssPath = path.join(ROOT, "src/styles/studio-overrides.css");
  if (!fs.existsSync(cssPath)) {
    fs.writeFileSync(
      cssPath,
      `/* Generated / edited by \`npm run ui\` (GrapesJS studio). Keep selectors scoped. */\n`
    );
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function authOk(req, url) {
  const header = String(req.headers["x-ui-studio-token"] || "");
  const q = url.searchParams.get("token") || "";
  return header === TOKEN || q === TOKEN;
}

function send(res, code, body, type = "application/json") {
  const data = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(data);
}

const EDITOR_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PeteZah UI Studio</title>
  <link rel="stylesheet" href="https://unpkg.com/grapesjs@0.22.9/dist/css/grapes.min.css" />
  <style>
    html, body { height: 100%; margin: 0; background: #0b1220; color: #e8eef7; font-family: ui-sans-serif, system-ui, sans-serif; }
    #bar { display:flex; gap:8px; align-items:center; padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.08); background:#0f172a; }
    #bar button, #bar select { background:#1e293b; color:#e2e8f0; border:1px solid rgba(255,255,255,.12); border-radius:8px; padding:7px 10px; cursor:pointer; font-size:12px; }
    #bar button.primary { background:#3b82f6; border-color:#60a5fa; color:white; }
    #bar .hint { font-size:11px; color:rgba(255,255,255,.45); margin-left:auto; }
    #gjs { height: calc(100% - 48px); }
    .gjs-one-bg { background:#0f172a !important; }
    .gjs-two-color { color:#e2e8f0 !important; }
  </style>
</head>
<body>
  <div id="bar">
    <strong style="font-size:13px">PeteZah UI Studio</strong>
    <select id="page">
      <option value="home">Homepage shell</option>
      <option value="ai">AI landing shell</option>
    </select>
    <button id="load">Load</button>
    <button id="save" class="primary">Save to src</button>
    <span class="hint">Localhost only · writes whitelisted files under src/</span>
  </div>
  <div id="gjs"></div>
  <script src="https://unpkg.com/grapesjs@0.22.9/dist/grapes.min.js"><\/script>
  <script src="https://unpkg.com/grapesjs-preset-webpage@1.0.3/dist/index.js"><\/script>
  <script>
    const TOKEN = new URLSearchParams(location.search).get('token') || '';
    const headers = { 'Content-Type': 'application/json', 'X-UI-Studio-Token': TOKEN };

    const shells = {
      home: \`
        <section id="pz-home" style="min-height:70vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:32px;background:radial-gradient(ellipse at center, #123055 0%, #050a14 70%);color:#fff;font-family:system-ui,sans-serif">
          <h1 style="margin:0;font-size:2rem;letter-spacing:-0.03em">PeteZah</h1>
          <div class="pz-search" style="width:min(560px,92vw);display:flex;align-items:center;gap:12px;border-radius:999px;padding:14px 20px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);box-shadow:0 10px 28px rgba(0,0,0,.28)">
            <input placeholder="Search the web..." style="flex:1;background:transparent;border:0;outline:0;color:#fff;font-size:15px" />
            <span style="opacity:.5">⌕</span>
          </div>
        </section>\`,
      ai: \`
        <section id="pz-ai" style="min-height:70vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:32px;background:#050a14;color:#fff;font-family:system-ui,sans-serif">
          <h1 style="margin:0;font-size:2.2rem;letter-spacing:-0.03em">Make anything</h1>
          <p style="margin:0;opacity:.45;font-size:13px">Ask PeteAI — ideas, code, stories, and more</p>
          <div class="pz-ask" style="width:min(640px,94vw);border-radius:22px;padding:14px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);box-shadow:0 16px 48px rgba(0,0,0,.32)">
            <div style="min-height:72px;opacity:.4;font-size:15px;padding:4px">Ask PeteAI anything...</div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
              <div style="display:flex;gap:8px">
                <span style="width:32px;height:32px;border-radius:999px;background:rgba(255,255,255,.08);display:inline-block"></span>
                <span style="height:32px;border-radius:999px;padding:0 12px;background:rgba(255,255,255,.07);display:inline-flex;align-items:center;font-size:11px;opacity:.7">model</span>
              </div>
              <span style="width:36px;height:36px;border-radius:999px;background:rgba(255,255,255,.9)"></span>
            </div>
          </div>
        </section>\`
    };

    const editor = grapesjs.init({
      container: '#gjs',
      height: '100%',
      fromElement: false,
      storageManager: false,
      plugins: ['grapesjs-preset-webpage'],
      pluginsOpts: { 'grapesjs-preset-webpage': { blocksBasic: true } },
      canvas: { styles: [] },
    });

    function loadShell(key) {
      editor.setComponents(shells[key] || shells.home);
      editor.setStyle('');
    }

    async function loadSaved(key) {
      try {
        const file = key === 'ai' ? 'src/ui-studio/ai-shell.html' : 'src/ui-studio/home-shell.html';
        const r = await fetch('/api/load?file=' + encodeURIComponent(file), { headers });
        if (r.ok) {
          const d = await r.json();
          if (d.content) {
            editor.setComponents(d.content);
            return;
          }
        }
      } catch {}
      loadShell(key);
    }

    document.getElementById('load').onclick = () => loadSaved(document.getElementById('page').value);
    document.getElementById('page').onchange = (e) => loadSaved(e.target.value);

    document.getElementById('save').onclick = async () => {
      const key = document.getElementById('page').value;
      const html = editor.getHtml();
      const css = editor.getCss();
      const shellFile = key === 'ai' ? 'src/ui-studio/ai-shell.html' : 'src/ui-studio/home-shell.html';
      const payload = {
        files: [
          { path: shellFile, content: html },
          {
            path: 'src/styles/studio-overrides.css',
            content: '/* Generated by npm run ui */\\n' + css + '\\n',
          },
          {
            path: 'src/ui-studio/project.json',
            content: JSON.stringify({ updatedAt: Date.now(), page: key }, null, 2),
          },
        ],
      };
      const r = await fetch('/api/save', { method: 'POST', headers, body: JSON.stringify(payload) });
      const d = await r.json().catch(() => ({}));
      alert(r.ok ? 'Saved to src/' : ('Save failed: ' + (d.error || r.status)));
    };

    loadSaved('home');
  <\/script>
</body>
</html>`;

ensureDirs();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

    if (url.pathname === "/" || url.pathname === "/index.html") {
      if (!authOk(req, url)) return send(res, 401, "Unauthorized", "text/plain");
      return send(res, 200, EDITOR_HTML, "text/html; charset=utf-8");
    }

    if (url.pathname === "/api/load" && req.method === "GET") {
      if (!authOk(req, url)) return send(res, 401, { error: "Unauthorized" });
      const abs = safeResolve(url.searchParams.get("file"));
      if (!abs) return send(res, 403, { error: "File not allowed" });
      if (!fs.existsSync(abs)) return send(res, 200, { content: "" });
      const content = fs.readFileSync(abs, "utf8");
      if (content.length > MAX_BODY) return send(res, 413, { error: "File too large" });
      return send(res, 200, { content });
    }

    if (url.pathname === "/api/save" && req.method === "POST") {
      if (!authOk(req, url)) return send(res, 401, { error: "Unauthorized" });
      const raw = await readBody(req);
      let data;
      try {
        data = JSON.parse(raw.toString("utf8"));
      } catch {
        return send(res, 400, { error: "Invalid JSON" });
      }
      if (!data || !Array.isArray(data.files) || data.files.length > 8) {
        return send(res, 400, { error: "Invalid payload" });
      }
      const written = [];
      for (const file of data.files) {
        const abs = safeResolve(file?.path);
        if (!abs) return send(res, 403, { error: `Not allowed: ${file?.path}` });
        const content = String(file.content ?? "");
        if (content.length > MAX_BODY) return send(res, 413, { error: "File too large" });
        if (String(file.path).endsWith(".css") && /<\/?script/i.test(content)) {
          return send(res, 400, { error: "Invalid CSS content" });
        }
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, "utf8");
        written.push(file.path);
      }
      return send(res, 200, { ok: true, written });
    }

    send(res, 404, { error: "Not found" });
  } catch (e) {
    send(res, 500, { error: e?.message || "Server error" });
  }
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/?token=${TOKEN}`;
  console.log("\nPeteZah UI Studio (local only)");
  console.log(`  ${url}\n`);
  console.log("Saves only to whitelisted files under src/styles and src/ui-studio.");
  console.log("Press Ctrl+C to stop.\n");
  // Best-effort open browser on macOS/linux/windows
  const openCmd =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  try {
    spawn(openCmd[0], openCmd.slice(1), { stdio: "ignore", detached: true }).unref();
  } catch {}
});
