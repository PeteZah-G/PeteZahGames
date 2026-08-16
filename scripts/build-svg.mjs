#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { baremuxPath } from '@mercuryworkshop/bare-mux/node';
import { epoxyPath } from '@mercuryworkshop/epoxy-transport';
import { libcurlPath } from '@mercuryworkshop/libcurl-transport';
import { scramjetPath } from '@mercuryworkshop/scramjet/path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, 'backend', '.env.production') });
dotenv.config({ path: path.join(root, 'backend', '.env') });

function parseBase(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('BASE_URL must be set in backend/.env.production');
  }
  const u = new URL(raw.trim());
  if (u.protocol !== 'https:') throw new Error('BASE_URL must use https');
  if (u.username || u.password) throw new Error('BASE_URL must not include credentials');
  if (!/^[a-z0-9.-]+$/i.test(u.hostname)) throw new Error('BASE_URL host is invalid');
  return u.origin;
}

function cacheStamp() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}-${d.getFullYear()}`;
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: root, stdio: 'inherit', env: process.env });
    p.on('error', reject);
    p.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} failed (${code})`));
    });
  });
}

function copyInto(from, to) {
  if (!from || !existsSync(from)) return;
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true, force: true });
}

function rmIf(p) {
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}

function writeWispConfig(file, wispPath) {
  const js =
    '(()=>{var o=(window.__PZ_ORIGIN__||(location.protocol+"//"+location.host)).replace(/\\/+$/,"");var u=new URL(o);var ws=(u.protocol==="https:"?"wss://":"ws://")+u.host;window._CONFIG={wispurl:localStorage.getItem("proxServer")||ws+"' +
    wispPath +
    '",bareurl:o+"/api/edge/"};})();\n';
  writeFileSync(file, js);
}

function bust(url, v) {
  if (!url || /^(https?:)?\/\//i.test(url) || url.startsWith('data:')) return url;
  const join = url.includes('?') ? '&' : '?';
  return `${url}${join}v=${v}`;
}

const origin = parseBase(process.env.BASE_URL);
const v = cacheStamp();
const out = path.join(root, 'svg');

await run('npx', ['vite', 'build', '--mode', 'svg']);

copyInto(scramjetPath, path.join(out, 'q9vx'));
copyInto(baremuxPath, path.join(out, 'm4thx'));
copyInto(epoxyPath, path.join(out, 'e7px'));
copyInto(libcurlPath, path.join(out, 'l9cx'));
copyInto(path.join(root, 'public', 'q9vx'), path.join(out, 'q9vx'));
copyInto(path.join(root, 'public', 'm4thx'), path.join(out, 'm4thx'));
copyInto(path.join(root, 'public', 'e7px'), path.join(out, 'e7px'));
copyInto(path.join(root, 'public', 'l9cx'), path.join(out, 'l9cx'));
copyInto(path.join(root, 'node_modules', 'three', 'build'), path.join(out, 'vendor', 'three'));
copyInto(path.join(root, 'node_modules', 'vanta', 'dist'), path.join(out, 'vendor', 'vanta'));
copyInto(path.join(root, 'public', 'vendor', 'cap'), path.join(out, 'vendor', 'cap'));

const drop = [
  'storage',
  'firefox-wasm',
  'pages',
  'science',
  'math',
  'calc',
  'kernel',
  'modules',
  'petezah',
  'res',
  'transport',
  'lx',
  'uploads',
  'q9vx/sj.bundle.js',
];
for (const d of drop) rmIf(path.join(out, d));
rmIf(path.join(out, 'static', 'uv'));

const cfg = [
  ['config.js', '/wisp/'],
  ['static/alt-config-1.js', '/api/alt-wisp-1/'],
  ['static/alt-config-2.js', '/api/alt-wisp-2/'],
  ['static/alt-config-3.js', '/api/alt-wisp-3/'],
  ['static/alt-config-4.js', '/api/alt-wisp-4/'],
  ['static/alt-config-5.js', '/api/alt-wisp-5/'],
  ['static/tor-config.js', '/api/wisp-tor/'],
  ['static/google-config.js', '/api/wisp-premium/'],
];
for (const [rel, wisp] of cfg) {
  const f = path.join(out, rel);
  if (existsSync(f)) writeWispConfig(f, wisp);
}

const indexPath = path.join(out, 'index.html');
let html = readFileSync(indexPath, 'utf8');
const css = [...html.matchAll(/<link[^>]+href="([^"]+\.css[^"]*)"/g)].map((m) => m[1]);
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
const moduleScripts = [...html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)].map((m) => m[1]);
const originLit = JSON.stringify(origin);
const cacheLit = JSON.stringify(v);

const boot = `(() => {
  window.__PZ_ORIGIN__ = ${originLit};
  window.__PZ_CACHE__ = ${cacheLit};
  const ns = 'http://www.w3.org/1999/xhtml';
  const body = document.querySelector('body');
  if (!body) return;
  const svgRoot = document.documentElement;
  const head = document.createElementNS(ns, 'head');
  body.prepend(head);
  const htmlRoot = body.parentElement && body.parentElement.namespaceURI === ns ? body.parentElement : body;
  try { Object.defineProperty(document, 'head', { configurable: true, get() { return head; } }); } catch {}
  try { Object.defineProperty(document, 'body', { configurable: true, get() { return body; } }); } catch {}
  try { Object.defineProperty(document, 'documentElement', { configurable: true, get() { return htmlRoot; } }); } catch {}
  try {
    Object.defineProperty(svgRoot, 'className', {
      configurable: true,
      get() { return svgRoot.getAttribute('class') || ''; },
      set(value) { svgRoot.setAttribute('class', value || ''); },
    });
  } catch {}
  const originalCreateElement = document.createElement.bind(document);
  document.createElement = function createElement(tagName, options) {
    return typeof tagName === 'string'
      ? document.createElementNS(ns, tagName, options)
      : originalCreateElement(tagName, options);
  };
})();`;

const loaders = [];
for (const href of css) {
  loaders.push(
    `var l=document.createElement('link');l.rel='stylesheet';l.crossOrigin='';l.href=${JSON.stringify(bust(href, v))};document.head.appendChild(l);`,
  );
}
const entry = moduleScripts[0] || scripts.filter((s) => s.includes('assets/'))[0];
if (entry) {
  loaders.push(
    `var s=document.createElement('script');s.type='module';s.crossOrigin='';s.src=${JSON.stringify(bust(entry, v))};document.body.appendChild(s);`,
  );
}
loaders.push(
  `var m=document.createElement('script');m.src=${JSON.stringify("m4thx/index.js?v=" + v)};document.body.appendChild(m);`,
);
loaders.push(
  `var c=document.createElement('script');c.src=${JSON.stringify("q9vx/sj.all.js?v=" + v)};document.body.appendChild(c);`,
);

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style="position: fixed; inset: 0;">
  <foreignObject x="0" y="0" width="100%" height="100%">
    <body xmlns="http://www.w3.org/1999/xhtml" lang="en" style="margin: 0; width: 100%; height: 100%; min-height: 100vh; overflow: hidden; background: #020810;">
      <div id="root"></div>
      <style><![CDATA[
        html, body, #root { width: 100%; height: 100%; min-height: 100vh; margin: 0; background: #020810; }
        body { opacity: 1; }
      ]]></style>
      <script><![CDATA[
${boot}
${loaders.join('\n')}
      ]]></script>
    </body>
  </foreignObject>
</svg>
`;

writeFileSync(path.join(out, 'index.svg'), svg);
writeFileSync(path.join(out, '.cache-stamp'), v);
console.log(`svg build ready → svg/index.svg  BASE_URL=${origin}  v=${v}`);
