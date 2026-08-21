import express from 'express';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const buckets = new Map();
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function clientKey(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0]
    .trim()
    .slice(0, 64);
}

function allow(req) {
  const key = clientKey(req);
  const now = Date.now();
  if (buckets.size > 20000) {
    for (const [k, v] of buckets) {
      if (now > v.reset) buckets.delete(k);
    }
  }
  const b = buckets.get(key) || { n: 0, reset: now + 60_000 };
  if (now > b.reset) {
    b.n = 0;
    b.reset = now + 60_000;
  }
  b.n += 1;
  buckets.set(key, b);
  return b.n <= 90;
}

function cleanQuery(q) {
  return String(q || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

let gamesCache = { at: 0, items: [] };
let appsCache = { at: 0, items: [] };

function loadJsonList(rel, mapFn) {
  try {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) return [];
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const list = Array.isArray(data) ? data : data.games || data.apps || data.items || [];
    return list.map(mapFn).filter((x) => x && x.label);
  } catch {
    return [];
  }
}

function getGames() {
  if (Date.now() - gamesCache.at < 5 * 60_000 && gamesCache.items.length) return gamesCache.items;
  const items = loadJsonList('public/storage/data/collection.json', (g) => ({
    id: String(g.id || g.label || ''),
    label: String(g.label || g.title || '').trim(),
    url: String(g.url || ''),
    imageUrl: String(g.imageUrl || ''),
  }));
  gamesCache = { at: Date.now(), items };
  return items;
}

function getApps() {
  if (Date.now() - appsCache.at < 5 * 60_000 && appsCache.items.length) return appsCache.items;
  const candidates = [
    'public/storage/data/apps.json',
    'public/storage/data/apps-collection.json',
  ];
  let items = [];
  for (const rel of candidates) {
    items = loadJsonList(rel, (a) => ({
      id: String(a.id || a.label || ''),
      label: String(a.label || a.title || a.name || '').trim(),
      url: String(a.url || ''),
    }));
    if (items.length) break;
  }
  appsCache = { at: Date.now(), items };
  return items;
}

function matchLocal(list, q, limit = 4) {
  const needle = q.toLowerCase();
  if (needle.length < 1) return [];
  const scored = [];
  for (const item of list) {
    const label = item.label.toLowerCase();
    if (!label.includes(needle)) continue;
    const score = label.startsWith(needle) ? 2 : 1;
    scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score || a.item.label.length - b.item.label.length);
  return scored.slice(0, limit).map((s) => s.item);
}

async function duckSuggest(q) {
  try {
    const url = `https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}&type=list`;
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(2500),
    });
    if (!r.ok) return [];
    const data = await r.json();
    const phrases = Array.isArray(data?.[1])
      ? data[1]
      : Array.isArray(data)
        ? data.map((x) => (typeof x === 'string' ? x : x?.phrase)).filter(Boolean)
        : [];
    return phrases
      .map((p) => String(p || '').trim())
      .filter((p) => p && p.length <= 100)
      .slice(0, 8);
  } catch {
    return [];
  }
}

async function wikiSuggest(q) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=6&namespace=0&format=json&origin=*`;
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(2500),
    });
    if (!r.ok) return [];
    const data = await r.json();
    const titles = Array.isArray(data?.[1]) ? data[1] : [];
    return titles.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 6);
  } catch {
    return [];
  }
}

router.get('/suggest', async (req, res) => {
  if (!allow(req)) return res.status(429).json({ error: 'Too many requests' });
  const q = cleanQuery(req.query.q);
  if (q.length < 1) return res.json({ suggestions: [] });

  const [ddg, wiki] = await Promise.all([duckSuggest(q), wikiSuggest(q)]);
  const web = [];
  const seen = new Set();
  for (const phrase of [...ddg, ...wiki]) {
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    web.push({
      type: 'web',
      label: phrase,
      url: `https://duckduckgo.com/?q=${encodeURIComponent(phrase)}`,
    });
    if (web.length >= 8) break;
  }

  const games = matchLocal(getGames(), q, 6).map((g) => ({
    type: 'games',
    label: g.label,
    url: `petezah://gameviewer?url=${encodeURIComponent(g.url)}&title=${encodeURIComponent(g.label)}&gid=${encodeURIComponent(g.id)}`,
    tag: 'Game',
    imageUrl: g.imageUrl || '',
  }));

  const apps = matchLocal(getApps(), q, 3).map((a) => ({
    type: 'apps',
    label: a.label,
    url: a.url?.startsWith('http')
      ? `petezah://appviewer?url=${encodeURIComponent(a.url)}&title=${encodeURIComponent(a.label)}`
      : `petezah://apps?q=${encodeURIComponent(a.label)}`,
    tag: 'Apps',
    imageUrl: a.imageUrl || '',
  }));

  const shortcuts = [
    {
      type: 'shortcut',
      label: q,
      url: `petezah://games?q=${encodeURIComponent(q)}`,
      tag: 'Search in Games',
      action: 'games',
    },
    {
      type: 'shortcut',
      label: q,
      url: `petezah://music?q=${encodeURIComponent(q)}`,
      tag: 'Search on Music',
      action: 'music',
    },
    {
      type: 'shortcut',
      label: q,
      url: `petezah://movies?q=${encodeURIComponent(q)}`,
      tag: 'Search in Movies',
      action: 'movies',
    },
  ];

  res.setHeader('Cache-Control', 'private, max-age=20');
  res.json({
    suggestions: [...games, ...apps, ...web, ...shortcuts].slice(0, 18),
  });
});

export default router;
