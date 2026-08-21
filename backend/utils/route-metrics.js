const MAX_ROUTES = 48;
const keys = new Array(MAX_ROUTES);
const counts = new Uint32Array(MAX_ROUTES);
const totalMs = new Float64Array(MAX_ROUTES);
let used = 0;
let sampleN = 0;

function normalizePath(path) {
  if (!path || typeof path !== 'string' || path.charCodeAt(0) !== 47) return '/';
  let out = '';
  let seg = 0;
  let i = 1;
  const n = path.length;
  while (i < n && seg < 4) {
    let j = i;
    while (j < n && path.charCodeAt(j) !== 47) j++;
    const len = j - i;
    if (len > 0) {
      let part = path.slice(i, j);
      if (len > 36 || /^\d+$/.test(part) || /^[0-9a-f-]{8,}$/i.test(part)) part = ':id';
      out += '/' + part;
      seg++;
    }
    i = j + 1;
  }
  return out || '/';
}

function slotFor(key) {
  for (let i = 0; i < used; i++) {
    if (keys[i] === key) return i;
  }
  if (used >= MAX_ROUTES) return -1;
  const i = used++;
  keys[i] = key;
  return i;
}

export function recordRouteTiming(path, ms) {
  sampleN++;
  if ((sampleN & 3) !== 0) return;
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0 || n > 60000) return;
  const key = normalizePath(path);
  const i = slotFor(key);
  if (i < 0) return;
  counts[i] += 4;
  totalMs[i] += n * 4;
}

export function getRouteTimingStats() {
  const rows = [];
  for (let i = 0; i < used; i++) {
    const c = counts[i];
    if (!c) continue;
    rows.push({
      route: keys[i],
      count: c,
      totalMs: Math.round(totalMs[i]),
      avgMs: Math.round((totalMs[i] / c) * 10) / 10,
    });
  }
  rows.sort((a, b) => b.totalMs - a.totalMs);
  return { routes: rows.slice(0, 24), sampled: sampleN };
}

export function createRouteTimingMiddleware() {
  return (req, res, next) => {
    const p = req.path || '';
    if (!p.startsWith('/api/')) return next();
    const t0 = process.hrtime.bigint();
    res.on('finish', () => {
      recordRouteTiming(p, Number(process.hrtime.bigint() - t0) / 1e6);
    });
    next();
  };
}
