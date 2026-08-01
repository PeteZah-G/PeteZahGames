import db from '../db.js';

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_daily (
      day TEXT NOT NULL,
      metric TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, metric)
    );
  `);
} catch (err) {
  console.error('usage_daily init error:', err.message);
}

const ALLOWED = new Set([
  'games',
  'proxy',
  'ai',
  'movies',
  'music',
  'chat',
  'firefox_vm',
]);

const pending = Object.create(null);
let flushTimer = null;
let proxyDay = '';
const proxySeen = new Set();
const PROXY_SEEN_MAX = 6000;

const upsertStmt = db.prepare(
  `INSERT INTO usage_daily (day, metric, count) VALUES (?, ?, ?)
   ON CONFLICT(day, metric) DO UPDATE SET count = count + excluded.count`
);

function todayKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

function flushUsage() {
  flushTimer = null;
  const day = todayKey();
  const keys = Object.keys(pending);
  if (!keys.length) return;
  const run = db.transaction(() => {
    for (let i = 0; i < keys.length; i++) {
      const metric = keys[i];
      const n = pending[metric] | 0;
      if (!n) continue;
      pending[metric] = 0;
      upsertStmt.run(day, metric, n);
    }
  });
  try {
    run();
  } catch (err) {
    console.error('usage_daily flush error:', err.message);
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flushUsage, 12000);
  if (typeof flushTimer.unref === 'function') flushTimer.unref();
}

export function bumpUsage(metric, by = 1) {
  if (!ALLOWED.has(metric)) return;
  const n = Math.trunc(Number(by));
  if (!Number.isFinite(n) || n === 0) return;
  pending[metric] = (pending[metric] | 0) + n;
  scheduleFlush();
}

export function bumpProxySession(clientId) {
  if (!clientId) return;
  const day = todayKey();
  if (day !== proxyDay) {
    proxyDay = day;
    proxySeen.clear();
  }
  const key = String(clientId).slice(0, 48);
  if (proxySeen.has(key)) return;
  if (proxySeen.size >= PROXY_SEEN_MAX) return;
  proxySeen.add(key);
  bumpUsage('proxy', 1);
}

export function getUsageCounts(day = todayKey()) {
  const rows = db.prepare('SELECT metric, count FROM usage_daily WHERE day = ?').all(day);
  const out = {
    games: 0,
    proxy: 0,
    ai: 0,
    movies: 0,
    music: 0,
    chat: 0,
    firefox_vm: 0,
  };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (ALLOWED.has(row.metric)) out[row.metric] = row.count || 0;
  }
  for (const metric of Object.keys(pending)) {
    if (!ALLOWED.has(metric)) continue;
    const n = pending[metric] | 0;
    if (n) out[metric] = (out[metric] || 0) + n;
  }
  return out;
}

process.once('beforeExit', () => {
  try {
    flushUsage();
  } catch {}
});
