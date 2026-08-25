#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function assertLen(pairs) {
  for (const [a, b] of pairs) {
    if (a.length !== b.length) throw new Error(`length mismatch ${a} vs ${b}`);
  }
}

const MUX_JS = [
  ['setManualTransport', 'bindManualTransfer'],
  ['setTransport', 'bindTransfer'],
  ['BareMux', 'ClipMux'],
  ['BareClient', 'ClipClient'],
  ['BareTransport', 'ClipTransport'],
  ['bare-mux', 'clip-mux'],
  ['baremuxinit', 'clipmuxinit'],
];

const ENGINE_JS = [
  ['duskline', 'voltedge'],
  ['Duskline', 'Voltedge'],
  ['DUSKLINE', 'VOLTEDGE'],
  ['dusk-frames', 'volt-frames'],
  ['Scramjet', 'Voltedge'],
  ['scramjet', 'voltedge'],
  ['SCRAMJET', 'VOLTEDGE'],
  ['scram-frame', 'volt-frames'],
  ['encodeUrl', 'sealHrefs'],
  ['decodeUrl', 'openHrefs'],
  ['createFrame', 'openSurface'],
  ['bare-mux', 'clip-mux'],
  ['sourcemaps:!0', 'sourcemaps:!1'],
  ['indirect eval proxy', 'indirect eval remap'],
  ...MUX_JS,
];

const STREAM_JS = [
  ['EpoxyTransport', 'RelayTransport'],
  ['EpoxyClientOptions', 'RelayClientOptions'],
  ['EpoxyHandlers', 'RelayHandlers'],
  ['EpoxyWebSocket', 'RelayWebSocket'],
  ['EpoxyClient', 'RelayClient'],
  ['epoxyInfo', 'relayInfo'],
  ['epoxy_bundled', 'relay_bundled'],
  ['epoxy.wasm', 'relay.wasm'],
  ['epoxy', 'relay'],
  ['Epoxy', 'Relay'],
  ['WispWebSocket', 'LinkWebSocket'],
  ['wisp_ws_protocols', 'link_ws_protocols'],
  ['wisp_connections', 'link_connections'],
  ['wisp_version', 'link_version'],
  ['wisp_url', 'link_url'],
  ['wisp_v2', 'link_v2'],
  ['Wisp', 'Link'],
  ['wisp', 'link'],
];

const CURL_JS = [
  ['LibcurlClient', 'NetcurlClient'],
  ['libcurl', 'netcurl'],
  ['Libcurl', 'Netcurl'],
];

assertLen(ENGINE_JS);
assertLen(MUX_JS);
assertLen(STREAM_JS);
assertLen(CURL_JS);

const ENGINE_WASM = [
  ['scramjet', 'voltedge'],
  ['duskline', 'voltedge'],
];
const STREAM_WASM = [
  ['epoxy', 'relay'],
  ['wisp', 'link'],
];

function applyPairs(text, pairs) {
  let s = String(text);
  for (const [a, b] of pairs) s = s.split(a).join(b);
  return s;
}

function cloakWasm(buf, pairs) {
  const out = Buffer.from(buf);
  let n = 0;
  for (const [fromStr, toStr] of pairs) {
    const from = Buffer.from(fromStr, 'ascii');
    const to = Buffer.from(toStr, 'ascii');
    if (from.length !== to.length) throw new Error('wasm token length mismatch');
    let i = 0;
    while ((i = out.indexOf(from, i)) !== -1) {
      to.copy(out, i);
      i += to.length;
      n++;
    }
  }
  return { buf: out, n };
}

function cloakEmbedded(js, wasmPairs) {
  if (!wasmPairs.length) return js;
  let s = js;
  s = s.replace(/atob\(\s*'([A-Za-z0-9+/=\s]+)'\s*\)/g, (m, b64) => {
    const raw = Buffer.from(String(b64).replace(/\s+/g, ''), 'base64');
    const { buf } = cloakWasm(raw, wasmPairs);
    return m.replace(b64, buf.toString('base64'));
  });
  s = s.replace(/data:application\/octet-stream;base64,([A-Za-z0-9+/=]+)/g, (m, b64) => {
    const raw = Buffer.from(b64, 'base64');
    const { buf } = cloakWasm(raw, wasmPairs);
    return 'data:application/octet-stream;base64,' + buf.toString('base64');
  });
  return s;
}

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

function cloakFile(file, jsPairs, wasmPairs) {
  const base = path.basename(file).toLowerCase();
  if (base.endsWith('.map')) {
    writeFileSync(file, '{}\n');
    return 'map-stripped';
  }
  if (base.endsWith('.wasm')) {
    const { buf, n } = cloakWasm(readFileSync(file), wasmPairs.length ? wasmPairs : ENGINE_WASM);
    if (n) writeFileSync(file, buf);
    return n ? `wasm:${n}` : 'wasm:0';
  }
  if (base.endsWith('.js') || base.endsWith('.mjs') || base.endsWith('.cjs')) {
    const before = readFileSync(file, 'utf8');
    let after = cloakEmbedded(before, wasmPairs);
    after = applyPairs(after, jsPairs);
    after = after.replace(/\/\/[#@]\s*sourceMappingURL=.*$/gm, '');
    if (after !== before) writeFileSync(file, after);
    return 'js';
  }
  return 'skip';
}

const jobs = [
  { dir: path.join(root, 'public', 'q9vx'), js: ENGINE_JS, wasm: ENGINE_WASM },
  { dir: path.join(root, 'public', 'kernel'), js: ENGINE_JS, wasm: ENGINE_WASM },
  { dir: path.join(root, 'public', 'modules'), js: ENGINE_JS, wasm: ENGINE_WASM },
  { dir: path.join(root, 'public', 'res'), js: ENGINE_JS, wasm: ENGINE_WASM },
  { dir: path.join(root, 'public', 'm4thx'), js: MUX_JS, wasm: [] },
  { dir: path.join(root, 'public', 'e7px'), js: [...STREAM_JS], wasm: STREAM_WASM },
  {
    dir: path.join(root, 'public', 'l9cx'),
    js: [...STREAM_JS.filter((p) => !p[0].toLowerCase().includes('epoxy')), ...CURL_JS],
    wasm: [
      ['libcurl', 'netcurl'],
      ['wisp', 'link'],
    ],
  },
];

const report = [];
for (const job of jobs) {
  for (const file of walk(job.dir)) {
    report.push(`${path.relative(root, file)} ${cloakFile(file, job.js, job.wasm)}`);
  }
}

if (process.argv[1] && process.argv[1].includes('cloak-engine')) {
  for (const line of report) console.log(line);
}
