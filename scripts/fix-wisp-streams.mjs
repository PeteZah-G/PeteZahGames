import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  'node_modules/@mercuryworkshop/wisp-js/src/server/filter.mjs',
  'node_modules/@mercuryworkshop/wisp-js/dist/wisp-server.cjs',
  'node_modules/@mercuryworkshop/wisp-js/dist/wisp-full.cjs',
];

const replacements = [
  [
    'for (let stream of connection.streams) {',
    'for (let stream of Object.values(connection.streams || {})) {',
  ],
  [
    'for (let stream of connection.streams){',
    'for (let stream of Object.values(connection.streams || {})){',
  ],
  [
    'for(let stream of connection.streams){',
    'for(let stream of Object.values(connection.streams||{})){',
  ],
];

let fixed = 0;
for (const rel of targets) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) continue;
  let src = fs.readFileSync(file, 'utf8');
  let next = src;
  for (const [from, to] of replacements) {
    if (next.includes(from)) next = next.split(from).join(to);
  }
  if (next !== src) {
    fs.writeFileSync(file, next);
    fixed += 1;
    console.log(`fixed ${rel}`);
  }
}

if (!fixed) {
  console.log('wisp streams patch already applied or sources missing');
}
