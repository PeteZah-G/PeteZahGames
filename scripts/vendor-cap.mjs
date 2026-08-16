#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dest = path.join(root, 'public', 'vendor', 'cap');
mkdirSync(dest, { recursive: true });

const files = [
  [path.join(root, 'node_modules/@cap.js/widget/cap.min.js'), 'cap.min.js'],
  [path.join(root, 'node_modules/@cap.js/wasm/browser/cap_wasm_bg.wasm'), 'cap_wasm_bg.wasm'],
  [path.join(root, 'node_modules/pako/dist/pako_inflate.min.js'), 'pako_inflate.min.js'],
];

for (const [from, name] of files) {
  if (!existsSync(from)) {
    console.error('[vendor-cap] missing', from);
    process.exit(1);
  }
  copyFileSync(from, path.join(dest, name));
}
