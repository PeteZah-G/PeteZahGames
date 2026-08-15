import rateLimit from 'express-rate-limit';
import fetch from 'node-fetch';
import httpsProxyAgentPkg from 'https-proxy-agent';
import db from '../db.js';
import { isOwnerEmail } from '../utils/auth-roles.js';
import { toIPv4 } from '../middleware/security.js';

const HttpsProxyAgent =
  httpsProxyAgentPkg.HttpsProxyAgent
  || httpsProxyAgentPkg.default
  || httpsProxyAgentPkg;

const EXO_BASE = 'https://api.exoclick.com/v2';
const CACHE_MS = 90000;
const FETCH_MS = 12000;
const MAX_ROWS = 80;

export const adReportsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  keyGenerator: (req) => req.session?.user?.id || toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'rate_limit' }),
});

let tokenCache = { access: '', type: 'Bearer', exp: 0 };
let payloadCache = { at: 0, body: null };
let proxyAgent = null;

function requireAdmin(req, res) {
  if (!req.session?.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const row = db.prepare('SELECT is_admin, email, banned FROM users WHERE id = ?').get(req.session.user.id);
  if (!row || row.banned) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const owner = isOwnerEmail(row.email);
  let level = Number(row.is_admin || 0);
  if (owner && level < 3) {
    db.prepare('UPDATE users SET is_admin = 3 WHERE id = ?').run(req.session.user.id);
    level = 3;
  }
  if (level < 1 && !owner) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return { id: req.session.user.id, is_admin: Math.max(level, owner ? 3 : level) };
}

function reportingToken() {
  const raw = process.env.EXOCLICK_API_TOKEN || process.env.EXO_API_TOKEN || '';
  return typeof raw === 'string' ? raw.trim() : '';
}

function getProxyAgent() {
  if (proxyAgent !== null) return proxyAgent || undefined;
  const url = String(process.env.EXOCLICK_HTTP_PROXY || process.env.HTTPS_PROXY || '').trim();
  if (!url) {
    proxyAgent = false;
    return undefined;
  }
  try {
    proxyAgent = new HttpsProxyAgent(url);
    return proxyAgent;
  } catch {
    proxyAgent = false;
    return undefined;
  }
}

function ymdUTC(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function addDays(day, n) {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return ymdUTC(d);
}

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

function clipStr(v, max = 80) {
  if (v === null || v === undefined) return '';
  return String(v).slice(0, max);
}

function emptyTotals() {
  return {
    earnings: 0,
    clicks: 0,
    uniqueUsers: 0,
    impressions: 0,
    videoViews: 0,
    rejected: 0,
    fallback: 0,
    overcapped: 0,
    views: 0,
    ecpm: 0,
    ctr: 0,
    vtr: 0,
    rejectRate: 0,
  };
}

function rowMetrics(row) {
  const video = row?.video && typeof row.video === 'object' ? row.video : {};
  const impressions = num(row?.impressions);
  const clicks = num(row?.clicks);
  const earnings = num(row?.revenue ?? row?.earnings ?? row?.value);
  const videoImps = num(video.impressions);
  const videoViews = num(video.views);
  const views = videoViews || videoImps || impressions;
  const ctr = num(row?.ctr) || (views > 0 ? clicks / views : 0);
  const ecpm = num(row?.cpm) || (views > 0 ? (earnings / views) * 1000 : 0);
  const vtr = num(video.vtr);
  const vtrNorm = vtr > 1 ? vtr / 100 : vtr;
  return {
    impressions,
    clicks,
    earnings,
    videoViews,
    views,
    ctr,
    ecpm,
    vtr: vtrNorm || (videoImps > 0 ? videoViews / videoImps : 0),
  };
}

function sumRows(rows) {
  const acc = emptyTotals();
  for (const r of rows || []) {
    const m = rowMetrics(r);
    acc.earnings += m.earnings;
    acc.clicks += m.clicks;
    acc.impressions += m.impressions;
    acc.videoViews += m.videoViews;
    acc.views += m.views;
  }
  acc.ecpm = acc.views > 0 ? (acc.earnings / acc.views) * 1000 : 0;
  acc.ctr = acc.views > 0 ? acc.clicks / acc.views : 0;
  acc.vtr = acc.impressions > 0 ? acc.videoViews / acc.impressions : 0;
  acc.uniqueUsers = acc.views;
  return acc;
}

function groupLabel(row, key) {
  const g = row?.group_by && typeof row.group_by === 'object' ? row.group_by : {};
  const node = g[key];
  if (node == null) {
    if (key === 'date') return clipStr(row?.date || row?.ddate || '');
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') return clipStr(node);
  return clipStr(
    node.name
    || node.date
    || node.country_short_name
    || node.country_iso
    || node.iso
    || node.id
    || ''
  );
}

function rowDate(row) {
  return groupLabel(row, 'date') || clipStr(row?.date || row?.ddate || '');
}

function extractRows(data) {
  if (!data) return [];
  if (Array.isArray(data.result)) return data.result;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.rows)) return data.rows;
  if (Array.isArray(data)) return data;
  return [];
}

async function exoFetch(path, { method = 'GET', token = '', tokenType = 'Bearer', body, query } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_MS);
  try {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `${tokenType || 'Bearer'} ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let url = `${EXO_BASE}${path}`;
    if (query) url += (url.includes('?') ? '&' : '?') + query;
    const opts = {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ac.signal,
      redirect: 'follow',
    };
    const agent = getProxyAgent();
    if (agent) opts.agent = agent;
    const r = await fetch(url, opts);
    const text = await r.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { ok: r.ok, status: r.status, data, text: text.slice(0, 240) };
  } finally {
    clearTimeout(timer);
  }
}

async function getAccessToken(apiToken) {
  if (tokenCache.access && Date.now() < tokenCache.exp - 20000) {
    return { access: tokenCache.access, type: tokenCache.type || 'Bearer' };
  }
  const res = await exoFetch('/login', {
    method: 'POST',
    body: { api_token: apiToken },
  });
  const access = res.data?.token || res.data?.data?.token || res.data?.access_token;
  const type = clipStr(res.data?.type || res.data?.data?.type || 'Bearer', 32) || 'Bearer';
  const expiresIn = num(res.data?.expires_in || res.data?.data?.expires_in || 900);
  if (res.ok && typeof access === 'string' && access.length > 8 && access.length < 8000) {
    tokenCache = {
      access,
      type,
      exp: Date.now() + Math.min(Math.max(expiresIn, 60), 3600) * 1000,
    };
    return { access, type };
  }
  const err = new Error(`auth_${res.status || 'fail'}`);
  err.detail = res.text || '';
  throw err;
}

async function fetchStats(token, tokenType, start, end, groupBy) {
  const body = {
    detailed: 1,
    totals: 1,
    filter: { date_from: start, date_to: end },
    group_by: [groupBy],
    order_by: [{ field: 'revenue', order: 'desc' }],
    projection: { base: ['*'], video: ['*'] },
    limit: 100,
    offset: 0,
  };

  const attempts = [
    { path: '/statistics/p/global', method: 'POST', body },
    {
      path: '/statistics/p/global',
      method: 'POST',
      body: {
        filter: { date_from: start, date_to: end },
        group_by: [groupBy],
        totals: 1,
      },
    },
    {
      path: `/statistics/publisher/${groupBy === 'date' ? 'date' : groupBy === 'zone_id' ? 'zone' : groupBy === 'country_iso' ? 'country' : 'date'}`,
      method: 'GET',
      query: new URLSearchParams({
        'date-from': start,
        'date-to': end,
        limit: '100',
        offset: '0',
      }).toString(),
    },
  ];

  for (const attempt of attempts) {
    const res = await exoFetch(attempt.path, {
      method: attempt.method,
      token,
      tokenType,
      body: attempt.body,
      query: attempt.query,
    });
    if (!res.ok || !res.data) continue;
    const rows = extractRows(res.data);
    if (rows.length || res.ok) return rows.slice(0, MAX_ROWS * 4);
  }
  return [];
}

async function fetchBalance(token, tokenType) {
  const paths = ['/user', '/users/me', '/payments'];
  for (const path of paths) {
    const res = await exoFetch(path, { token, tokenType });
    if (!res.ok || !res.data) continue;
    const src = res.data.data || res.data.result || res.data;
    const amount = num(src.balance ?? src.available ?? src.amount);
    const currency = clipStr(src.currency || src.currency_code || 'USD', 8) || 'USD';
    if (amount || src.balance != null) return { amount, currency };
  }
  return null;
}

function oursWindow(fromDay, toDay) {
  const shown = db.prepare(
    `SELECT COUNT(*) AS n FROM ad_events WHERE kind = 'shown' AND day >= ? AND day <= ?`
  ).get(fromDay, toDay)?.n || 0;
  const attempts = db.prepare(
    `SELECT COUNT(*) AS n FROM ad_events WHERE kind = 'attempt' AND day >= ? AND day <= ?`
  ).get(fromDay, toDay)?.n || 0;
  const uniqueVisitors = db.prepare(
    `SELECT COUNT(DISTINCT visitor) AS n FROM ad_events WHERE kind = 'shown' AND day >= ? AND day <= ?`
  ).get(fromDay, toDay)?.n || 0;
  const uniqueAttempts = db.prepare(
    `SELECT COUNT(DISTINCT visitor) AS n FROM ad_events WHERE kind = 'attempt' AND day >= ? AND day <= ?`
  ).get(fromDay, toDay)?.n || 0;
  const byContext = db.prepare(
    `SELECT context, COUNT(*) AS n FROM ad_events WHERE kind = 'shown' AND day >= ? AND day <= ? GROUP BY context`
  ).all(fromDay, toDay);
  const ctx = { game: 0, app: 0, vm: 0 };
  for (const r of byContext) {
    if (r.context in ctx) ctx[r.context] = r.n;
  }
  return {
    views: shown,
    attempts,
    uniqueVisitors,
    uniqueAttempts,
    startRate: attempts > 0 ? shown / attempts : 0,
    freq: uniqueVisitors > 0 ? shown / uniqueVisitors : 0,
    byContext: ctx,
  };
}

function oursTodayHours(today) {
  const rows = db.prepare(
    `SELECT hour, kind, COUNT(*) AS n FROM ad_events WHERE day = ? GROUP BY hour, kind`
  ).all(today);
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, views: 0, attempts: 0 }));
  for (const r of rows) {
    const h = Number(r.hour);
    if (h < 0 || h > 23) continue;
    if (r.kind === 'shown') hours[h].views = r.n;
    else if (r.kind === 'attempt') hours[h].attempts = r.n;
  }
  return hours;
}

function oursDaily(fromDay, toDay) {
  const rows = db.prepare(
    `SELECT day, kind, COUNT(*) AS n, COUNT(DISTINCT visitor) AS u
     FROM ad_events WHERE day >= ? AND day <= ?
     GROUP BY day, kind`
  ).all(fromDay, toDay);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.day)) map.set(r.day, { date: r.day, views: 0, attempts: 0, uniqueVisitors: 0 });
    const rec = map.get(r.day);
    if (r.kind === 'shown') {
      rec.views = r.n;
      rec.uniqueVisitors = r.u;
    } else if (r.kind === 'attempt') rec.attempts = r.n;
  }
  const out = [];
  let d = fromDay;
  while (d <= toDay) {
    out.push(map.get(d) || { date: d, views: 0, attempts: 0, uniqueVisitors: 0 });
    d = addDays(d, 1);
  }
  return out;
}

function topKeyed(rows, key, limit = 12) {
  const list = (rows || [])
    .map((r) => {
      const m = rowMetrics(r);
      return {
        key: groupLabel(r, key) || 'unknown',
        earnings: m.earnings,
        views: m.views,
        uniqueUsers: m.views,
        clicks: m.clicks,
        ecpm: m.ecpm,
        rejected: 0,
        fallback: 0,
      };
    })
    .filter((r) => r.key)
    .sort((a, b) => b.earnings - a.earnings || b.views - a.views)
    .slice(0, limit);
  return list;
}

function buildInsights({ ours, exoclick, compare, balance, yesterday }) {
  const out = [];
  const oursToday = ours.today.views;
  const exoToday = exoclick.today.views;

  if (exoclick.error === 'not_configured') {
    out.push({
      tone: 'warn',
      title: 'ExoClick API token missing',
      body: 'Set EXOCLICK_API_TOKEN in backend/.env.production and restart PeteZahG.',
    });
  } else if (exoclick.error && String(exoclick.error).startsWith('auth')) {
    out.push({
      tone: 'warn',
      title: 'ExoClick login failed',
      body: 'API token was rejected. Regenerate it under Profile → API Tokens. If your VPS IP is blocked, set EXOCLICK_HTTP_PROXY to a residential proxy.',
    });
  } else if (exoclick.error) {
    out.push({
      tone: 'warn',
      title: 'ExoClick API unavailable',
      body: `Could not load publisher stats (${exoclick.error}). Local PeteZah counts below still work. Datacenter IPs are sometimes blocked — set EXOCLICK_HTTP_PROXY if needed.`,
    });
  }

  if (oursToday === 0 && exoToday === 0) {
    out.push({
      tone: 'info',
      title: 'No views yet today',
      body: 'Neither PeteZah nor ExoClick has counted a video ad view today. That is normal early in the day or if traffic is light.',
    });
  } else if (exoToday === 0 && oursToday > 0 && !exoclick.error) {
    out.push({
      tone: 'warn',
      title: 'We counted views ExoClick has not',
      body: `PeteZah recorded ${oursToday} started ads today, but ExoClick reports 0. Reporting often lags a few hours.`,
    });
  } else if (oursToday === 0 && exoToday > 0) {
    out.push({
      tone: 'warn',
      title: 'ExoClick sees views we do not',
      body: `ExoClick reports ${exoToday} today while our overlay tracker is at 0.`,
    });
  } else if (exoToday > 0) {
    const pct = compare.ratio;
    if (pct >= 0.7 && pct <= 1.4) {
      out.push({
        tone: 'good',
        title: 'Counts are aligned',
        body: `Today we recorded ${oursToday} started ads vs ExoClick ${exoToday} (${Math.round(pct * 100)}%).`,
      });
    } else if (pct != null) {
      out.push({
        tone: 'warn',
        title: 'View counts diverge',
        body: `PeteZah ${oursToday} vs ExoClick ${exoToday} (gap ${Math.abs(compare.delta)}).`,
      });
    }
  }

  if (ours.today.attempts > 0) {
    const sr = ours.today.startRate;
    if (sr < 0.35) {
      out.push({
        tone: 'warn',
        title: 'Low start rate',
        body: `Only ${Math.round(sr * 100)}% of gated attempts started a video ad (${ours.today.views}/${ours.today.attempts}).`,
      });
    } else if (sr >= 0.7) {
      out.push({
        tone: 'good',
        title: 'Solid start rate',
        body: `${Math.round(sr * 100)}% of gated attempts started a video ad today.`,
      });
    }
  }

  if (exoclick.today.ecpm > 0) {
    out.push({
      tone: 'info',
      title: 'eCPM snapshot',
      body: `Today ${exoclick.today.ecpm.toFixed(2)} ${exoclick.currency}/mille. 7-day ${exoclick.d7.ecpm.toFixed(2)}.`,
    });
  }

  if (exoclick.today.vtr > 0) {
    out.push({
      tone: exoclick.today.vtr >= 0.7 ? 'good' : 'info',
      title: 'Video completion',
      body: `VTR ${(exoclick.today.vtr * 100).toFixed(1)}% · ${exoclick.today.videoViews} completed views.`,
    });
  }

  const yEarn = yesterday.earnings;
  const tEarn = exoclick.today.earnings;
  if (yEarn > 0) {
    const ch = (tEarn - yEarn) / yEarn;
    out.push({
      tone: ch >= 0 ? 'good' : 'info',
      title: 'Earnings vs yesterday',
      body: `Today ${tEarn.toFixed(2)} ${exoclick.currency} vs yesterday ${yEarn.toFixed(2)} (${ch >= 0 ? '+' : ''}${Math.round(ch * 100)}%).`,
    });
  } else if (tEarn > 0) {
    out.push({
      tone: 'good',
      title: 'First earnings today',
      body: `${tEarn.toFixed(2)} ${exoclick.currency} so far.`,
    });
  }

  if (exoclick.byZone[0]) {
    const z = exoclick.byZone[0];
    out.push({
      tone: 'info',
      title: 'Top zone',
      body: `Zone ${z.key} leads with ${z.earnings.toFixed(2)} ${exoclick.currency} and ${z.views} views.`,
    });
  }

  if (balance && typeof balance.amount === 'number') {
    out.push({
      tone: balance.amount < 10 ? 'warn' : 'good',
      title: 'Publisher balance',
      body: `${balance.amount.toFixed(2)} ${balance.currency}.`,
    });
  }

  const d7avg = exoclick.d7.earnings / 7;
  if (d7avg > 0) {
    out.push({
      tone: 'info',
      title: '7-day run rate',
      body: `${exoclick.d7.earnings.toFixed(2)} ${exoclick.currency} over 7 days (~${d7avg.toFixed(2)}/day).`,
    });
  }

  return out.slice(0, 16);
}

function pickDayRows(rows, day) {
  return (rows || []).filter((r) => rowDate(r) === day);
}

export async function getAdminAdReportsHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');

  const force = String(req.query?.refresh || '') === '1';
  if (!force && payloadCache.body && Date.now() - payloadCache.at < CACHE_MS) {
    return res.json(payloadCache.body);
  }

  const token = reportingToken();
  const today = ymdUTC();
  const yesterday = addDays(today, -1);
  const d7 = addDays(today, -6);
  const d30 = addDays(today, -29);

  const ours = {
    today: oursWindow(today, today),
    yesterday: oursWindow(yesterday, yesterday),
    d7: oursWindow(d7, today),
    d30: oursWindow(d30, today),
    hours: oursTodayHours(today),
    daily: oursDaily(d30, today),
  };

  const emptyNet = {
    ok: false,
    error: token ? 'unavailable' : 'not_configured',
    currency: 'USD',
    timezone: 'UTC',
    today: emptyTotals(),
    yesterday: emptyTotals(),
    d7: emptyTotals(),
    d30: emptyTotals(),
    byZone: [],
    byCountry: [],
    byDevice: [],
    byDate: [],
    bySite: [],
  };

  let exoclick = { ...emptyNet };
  let balance = null;

  if (token) {
    try {
      const { access, type } = await getAccessToken(token);
      const [todayDate, todayZone, todayCountry, todayDevice, rangeDate, rangeZone, rangeSite, bal] = await Promise.all([
        fetchStats(access, type, today, today, 'date'),
        fetchStats(access, type, today, today, 'zone_id'),
        fetchStats(access, type, today, today, 'country_iso'),
        fetchStats(access, type, today, today, 'device_type_id'),
        fetchStats(access, type, d30, today, 'date'),
        fetchStats(access, type, d30, today, 'zone_id'),
        fetchStats(access, type, d30, today, 'site_id'),
        fetchBalance(access, type),
      ]);
      const yRows = pickDayRows(rangeDate, yesterday);
      const tRows = todayDate.length ? todayDate : pickDayRows(rangeDate, today);
      const d7Rows = (rangeDate || []).filter((r) => {
        const day = rowDate(r);
        return day >= d7 && day <= today;
      });
      exoclick = {
        ok: true,
        error: null,
        currency: clipStr(bal?.currency || 'USD', 8),
        timezone: 'UTC',
        today: sumRows(tRows),
        yesterday: sumRows(yRows),
        d7: sumRows(d7Rows),
        d30: sumRows(rangeDate),
        byZone: topKeyed(todayZone.length ? todayZone : rangeZone, 'zone_id'),
        byCountry: topKeyed(todayCountry, 'country_iso'),
        byDevice: topKeyed(todayDevice, 'device_type_id'),
        byDate: topKeyed(rangeDate, 'date', 31).sort((a, b) => a.key.localeCompare(b.key)),
        bySite: topKeyed(rangeSite, 'site_id'),
      };
      balance = bal;
    } catch (err) {
      tokenCache = { access: '', type: 'Bearer', exp: 0 };
      const code = err?.message || 'unavailable';
      exoclick = { ...emptyNet, error: code };
    }
  }

  const compare = {
    todayOurs: ours.today.views,
    todayExoclick: exoclick.today.views,
    delta: ours.today.views - exoclick.today.views,
    ratio: exoclick.today.views > 0 ? ours.today.views / exoclick.today.views : null,
    uniqueOurs: ours.today.uniqueVisitors,
    uniqueExoclick: exoclick.today.uniqueUsers,
  };

  const body = {
    configured: !!token,
    proxy: !!getProxyAgent(),
    generatedAt: Date.now(),
    day: today,
    ours,
    exoclick,
    compare,
    balance,
    insights: buildInsights({
      ours,
      exoclick,
      compare,
      balance,
      yesterday: exoclick.yesterday,
    }),
  };

  payloadCache = { at: Date.now(), body };
  return res.json(body);
}
