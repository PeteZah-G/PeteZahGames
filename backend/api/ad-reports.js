import rateLimit from 'express-rate-limit';
import fetch from 'node-fetch';
import db from '../db.js';
import { isOwnerEmail } from '../utils/auth-roles.js';
import { toIPv4 } from '../middleware/security.js';

const ADCASH_BASE = 'https://adcash.myadcash.com/api/v2';
const CACHE_MS = 120000;
const FETCH_MS = 8000;
const MAX_ROWS = 80;
const MAX_PAGES = 4;
const PAGE_SIZE = 200;
const GROUP_BY = new Set(['zone', 'site', 'country', 'date', 'month', 'week', 'device_type']);
const ROW_STR = ['zone', 'parent_zone', 'country', 'date', 'month', 'week', 'device_type', 'site', 'sub1', 'sub2'];
const ROW_NUM = [
  'earnings',
  'unique_users',
  'clicks',
  'impressions',
  'unique_users_fallback',
  'unique_users_overcapped',
  'unique_users_rejected',
  'unique_users_ecpm',
];

export const adReportsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  keyGenerator: (req) => req.session?.user?.id || toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'rate_limit' }),
});

let tokenCache = { access: '', exp: 0 };
let payloadCache = { at: 0, body: null };

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
  const raw = process.env.AD_CASH_REPORTING_API || process.env.ADCASH_REPORTING_API || '';
  return typeof raw === 'string' ? raw.trim() : '';
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

function sanitizeRow(row) {
  if (!row || typeof row !== 'object') return null;
  const out = {};
  for (const k of ROW_STR) {
    if (row[k] !== undefined && row[k] !== null) out[k] = clipStr(row[k]);
  }
  for (const k of ROW_NUM) {
    if (row[k] !== undefined && row[k] !== null) out[k] = num(row[k]);
  }
  return out;
}

function sumRows(rows) {
  const acc = {
    earnings: 0,
    clicks: 0,
    uniqueUsers: 0,
    impressions: 0,
    rejected: 0,
    fallback: 0,
    overcapped: 0,
  };
  for (const r of rows || []) {
    acc.earnings += num(r.earnings);
    acc.clicks += num(r.clicks);
    acc.uniqueUsers += num(r.unique_users);
    acc.impressions += num(r.impressions);
    acc.rejected += num(r.unique_users_rejected);
    acc.fallback += num(r.unique_users_fallback);
    acc.overcapped += num(r.unique_users_overcapped);
  }
  const views = acc.impressions > 0 ? acc.impressions : acc.uniqueUsers;
  return {
    ...acc,
    views,
    ecpm: views > 0 ? (acc.earnings / views) * 1000 : 0,
    ctr: views > 0 ? acc.clicks / views : 0,
    rejectRate: acc.uniqueUsers + acc.rejected > 0 ? acc.rejected / (acc.uniqueUsers + acc.rejected) : 0,
  };
}

async function adcashFetch(path, { method = 'GET', token = '', body } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_MS);
  try {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(`${ADCASH_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ac.signal,
      redirect: 'error',
    });
    const text = await r.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { ok: r.ok, status: r.status, data };
  } finally {
    clearTimeout(timer);
  }
}

async function getAccessToken(apiToken) {
  if (tokenCache.access && Date.now() < tokenCache.exp - 20000) return tokenCache.access;
  const res = await adcashFetch('/auth/token', {
    method: 'POST',
    body: { api_token: apiToken },
  });
  const access = res.data?.data?.access_token || res.data?.access_token;
  const expiresIn = num(res.data?.data?.expires_in || res.data?.expires_in || 900);
  if (res.ok && typeof access === 'string' && access.length > 8 && access.length < 8000) {
    tokenCache = { access, exp: Date.now() + Math.min(Math.max(expiresIn, 60), 900) * 1000 };
    return tokenCache.access;
  }
  if (apiToken.length > 8) {
    tokenCache = { access: apiToken, exp: Date.now() + 8 * 60 * 1000 };
    return apiToken;
  }
  throw new Error('auth');
}

async function fetchReport(token, start, end, groupBy) {
  if (!GROUP_BY.has(groupBy)) return { rows: [], meta: {} };
  const rows = [];
  let meta = {};
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({
      start_date: start,
      end_date: end,
      group_by: groupBy,
      sort_by: '-earnings',
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    let res = await adcashFetch(`/publishers/reports?${q.toString()}`, { token });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1200));
      res = await adcashFetch(`/publishers/reports?${q.toString()}`, { token });
    }
    if (!res.ok || !res.data) break;
    const chunk = Array.isArray(res.data?.data?.rows) ? res.data.data.rows : [];
    if (res.data.meta && typeof res.data.meta === 'object') meta = res.data.meta;
    for (const raw of chunk) {
      const row = sanitizeRow(raw);
      if (row) rows.push(row);
      if (rows.length >= MAX_ROWS * 4) break;
    }
    const total = num(res.data?.meta?.pagination?.total);
    offset += PAGE_SIZE;
    if (chunk.length < PAGE_SIZE || (total && offset >= total) || rows.length >= MAX_ROWS * 4) break;
  }
  return { rows: rows.slice(0, MAX_ROWS * 4), meta };
}

async function fetchBalance(token) {
  const res = await adcashFetch('/publishers/balance', { token });
  if (!res.ok || !res.data?.data) return null;
  const amount = num(res.data.data.balance);
  const currency = clipStr(res.data.data.currency || 'EUR', 8);
  return { amount, currency };
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
    .map((r) => ({
      key: clipStr(r[key] || 'unknown', 48),
      earnings: num(r.earnings),
      views: num(r.impressions) || num(r.unique_users),
      uniqueUsers: num(r.unique_users),
      clicks: num(r.clicks),
      ecpm: num(r.unique_users_ecpm) || ((num(r.impressions) || num(r.unique_users)) > 0
        ? (num(r.earnings) / (num(r.impressions) || num(r.unique_users))) * 1000
        : 0),
      rejected: num(r.unique_users_rejected),
      fallback: num(r.unique_users_fallback),
    }))
    .sort((a, b) => b.earnings - a.earnings || b.views - a.views)
    .slice(0, limit);
  return list;
}

function buildInsights({ ours, adcash, compare, balance, today, yesterday }) {
  const out = [];
  const oursToday = ours.today.views;
  const acToday = adcash.today.views;
  if (oursToday === 0 && acToday === 0) {
    out.push({
      tone: 'info',
      title: 'No views yet today',
      body: 'Neither PeteZah nor AdCash has counted a video ad view today. That is normal early in the day or if traffic is light.',
    });
  } else if (acToday === 0 && oursToday > 0) {
    out.push({
      tone: 'warn',
      title: 'We counted views AdCash has not',
      body: `PeteZah recorded ${oursToday} started ads today, but AdCash reports 0. Reporting often lags, or the VAST tag is not attributing to this publisher account.`,
    });
  } else if (oursToday === 0 && acToday > 0) {
    out.push({
      tone: 'warn',
      title: 'AdCash sees views we do not',
      body: `AdCash reports ${acToday} today while our overlay tracker is at 0. Those views may be coming from another placement, or /api/ads/shown is not firing on ad start.`,
    });
  } else {
    const gap = Math.abs(compare.delta);
    const pct = compare.ratio;
    if (pct >= 0.7 && pct <= 1.4) {
      out.push({
        tone: 'good',
        title: 'Counts are aligned',
        body: `Today we recorded ${oursToday} started ads vs AdCash ${acToday} (${Math.round(pct * 100)}%). Small gaps are expected from skip-before-start and reporting delay.`,
      });
    } else {
      out.push({
        tone: 'warn',
        title: 'View counts diverge',
        body: `PeteZah ${oursToday} vs AdCash ${acToday} (gap ${gap}). If ours is higher, many players start then no-fill. If AdCash is higher, extra inventory is running outside this overlay.`,
      });
    }
  }

  if (ours.today.attempts > 0) {
    const sr = ours.today.startRate;
    if (sr < 0.35) {
      out.push({
        tone: 'warn',
        title: 'Low start rate',
        body: `Only ${Math.round(sr * 100)}% of allowed gates became a started ad (${ours.today.views}/${ours.today.attempts}). The VAST tag is often empty or IMA errors before impression.`,
      });
    } else if (sr >= 0.7) {
      out.push({
        tone: 'good',
        title: 'Solid start rate',
        body: `${Math.round(sr * 100)}% of gated attempts started a video ad today.`,
      });
    } else {
      out.push({
        tone: 'info',
        title: 'Start rate is mixed',
        body: `${Math.round(sr * 100)}% of attempts started. Typical for VAST fill that varies by geo and hour.`,
      });
    }
  }

  if (adcash.today.ecpm > 0) {
    const vs7 = adcash.d7.views > 0 ? adcash.d7.ecpm : 0;
    if (vs7 > 0 && adcash.today.ecpm > vs7 * 1.25) {
      out.push({
        tone: 'good',
        title: 'eCPM is running hot',
        body: `Today eCPM ${adcash.today.ecpm.toFixed(2)} vs 7-day ${vs7.toFixed(2)}. Keep the same zones in rotation.`,
      });
    } else if (vs7 > 0 && adcash.today.ecpm < vs7 * 0.7) {
      out.push({
        tone: 'warn',
        title: 'eCPM is soft today',
        body: `Today eCPM ${adcash.today.ecpm.toFixed(2)} is below the 7-day ${vs7.toFixed(2)}. Mix or geo may be cheaper inventory.`,
      });
    } else {
      out.push({
        tone: 'info',
        title: 'eCPM snapshot',
        body: `Today ${adcash.today.ecpm.toFixed(2)} ${adcash.currency}/mille. 7-day ${vs7.toFixed(2)}.`,
      });
    }
  }

  if (adcash.today.ctr > 0) {
    out.push({
      tone: adcash.today.ctr >= 0.01 ? 'good' : 'info',
      title: 'Click-through',
      body: `CTR ${(adcash.today.ctr * 100).toFixed(2)}% on ${adcash.today.clicks} clicks. Video CTR is usually low; earnings still come from completed views.`,
    });
  }

  if (adcash.today.rejectRate > 0.12) {
    out.push({
      tone: 'warn',
      title: 'High rejection',
      body: `${Math.round(adcash.today.rejectRate * 100)}% of AdCash uniques were rejected today. Bot/quality filters or geo mismatch can drive this.`,
    });
  }

  if (adcash.today.fallback > adcash.today.uniqueUsers * 0.15 && adcash.today.uniqueUsers > 20) {
    out.push({
      tone: 'info',
      title: 'Fallback traffic',
      body: `${adcash.today.fallback} fallback uniques vs ${adcash.today.uniqueUsers} counted. A chunk of requests is not premium fill.`,
    });
  }

  const yEarn = yesterday.earnings;
  const tEarn = adcash.today.earnings;
  if (yEarn > 0) {
    const ch = (tEarn - yEarn) / yEarn;
    out.push({
      tone: ch >= 0 ? 'good' : 'info',
      title: 'Earnings vs yesterday',
      body: `Today ${tEarn.toFixed(2)} ${adcash.currency} vs yesterday ${yEarn.toFixed(2)} (${ch >= 0 ? '+' : ''}${Math.round(ch * 100)}%). Incomplete until end of day.`,
    });
  } else if (tEarn > 0) {
    out.push({
      tone: 'good',
      title: 'First earnings today',
      body: `${tEarn.toFixed(2)} ${adcash.currency} so far.`,
    });
  }

  if (adcash.byZone[0]) {
    const z = adcash.byZone[0];
    out.push({
      tone: 'info',
      title: 'Top zone',
      body: `Zone ${z.key} leads with ${z.earnings.toFixed(2)} ${adcash.currency} and ${z.views} views (eCPM ${z.ecpm.toFixed(2)}).`,
    });
  }

  if (adcash.byCountry[0]) {
    const c = adcash.byCountry[0];
    const share = adcash.today.views > 0 ? c.views / adcash.today.views : 0;
    out.push({
      tone: share > 0.55 ? 'warn' : 'info',
      title: 'Top country',
      body: `${c.key} is ${Math.round(share * 100)}% of AdCash views today. ${share > 0.55 ? 'Heavy concentration — revenue will swing with that geo.' : 'Spread looks healthier than a single-geo stack.'}`,
    });
  }

  if (adcash.byDevice[0]) {
    const d = adcash.byDevice[0];
    out.push({
      tone: 'info',
      title: 'Device mix',
      body: `${d.key || 'Unknown'} is the leading device with ${d.views} views and eCPM ${d.ecpm.toFixed(2)}.`,
    });
  }

  const ctx = ours.today.byContext;
  const ctxTotal = ctx.game + ctx.app + ctx.vm;
  if (ctxTotal > 0) {
    out.push({
      tone: 'info',
      title: 'Where we showed ads',
      body: `Games ${ctx.game} · Apps ${ctx.app} · VM ${ctx.vm}. ${ctx.game / ctxTotal > 0.8 ? 'Almost all overlay starts are on games.' : 'Starts are split across surfaces.'}`,
    });
  }

  const peak = ours.hours.reduce((a, b) => (b.views > a.views ? b : a), ours.hours[0] || { hour: 0, views: 0 });
  if (peak && peak.views > 0) {
    out.push({
      tone: 'info',
      title: 'Peak hour (UTC)',
      body: `${String(peak.hour).padStart(2, '0')}:00 UTC had ${peak.views} started ads. Compare with AdCash hourly lag if evening traffic looks missing.`,
    });
  }

  if (ours.today.freq > 1.6) {
    out.push({
      tone: 'info',
      title: 'Repeat viewers',
      body: `Average ${ours.today.freq.toFixed(2)} started ads per unique visitor today (cap is 2 / 5 min).`,
    });
  }

  if (balance && typeof balance.amount === 'number') {
    out.push({
      tone: balance.amount < 10 ? 'warn' : 'good',
      title: 'Publisher balance',
      body: `${balance.amount.toFixed(2)} ${balance.currency}.${balance.amount < 10 ? ' Low balance — confirm payout threshold in AdCash.' : ''}`,
    });
  }

  const d7avg = adcash.d7.earnings / 7;
  if (d7avg > 0) {
    out.push({
      tone: 'info',
      title: '7-day run rate',
      body: `${adcash.d7.earnings.toFixed(2)} ${adcash.currency} over 7 days (~${d7avg.toFixed(2)}/day). 30-day total ${adcash.d30.earnings.toFixed(2)}.`,
    });
  }

  return out.slice(0, 16);
}

function pickDayRows(rows, day) {
  return (rows || []).filter((r) => r.date === day);
}

export async function getAdminAdReportsHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');

  if (payloadCache.body && Date.now() - payloadCache.at < CACHE_MS) {
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

  const emptyAc = {
    ok: false,
    error: token ? 'unavailable' : 'not_configured',
    currency: 'EUR',
    timezone: 'UTC',
    today: sumRows([]),
    yesterday: sumRows([]),
    d7: sumRows([]),
    d30: sumRows([]),
    byZone: [],
    byCountry: [],
    byDevice: [],
    byDate: [],
    bySite: [],
  };

  let adcash = { ...emptyAc };
  let balance = null;

  if (token) {
    try {
      const access = await getAccessToken(token);
      const [todayDate, todayZone, todayCountry, todayDevice, rangeDate, rangeZone, rangeSite, bal] = await Promise.all([
        fetchReport(access, today, today, 'date'),
        fetchReport(access, today, today, 'zone'),
        fetchReport(access, today, today, 'country'),
        fetchReport(access, today, today, 'device_type'),
        fetchReport(access, d30, today, 'date'),
        fetchReport(access, d30, today, 'zone'),
        fetchReport(access, d30, today, 'site'),
        fetchBalance(access),
      ]);
      const meta = todayDate.meta || rangeDate.meta || {};
      const yRows = pickDayRows(rangeDate.rows, yesterday);
      const tRows = todayDate.rows.length ? todayDate.rows : pickDayRows(rangeDate.rows, today);
      const d7Rows = (rangeDate.rows || []).filter((r) => r.date >= d7 && r.date <= today);
      adcash = {
        ok: true,
        error: null,
        currency: clipStr(meta.currency || 'EUR', 8),
        timezone: clipStr(meta.timezone || 'UTC', 40),
        today: sumRows(tRows),
        yesterday: sumRows(yRows),
        d7: sumRows(d7Rows),
        d30: sumRows(rangeDate.rows),
        byZone: topKeyed(todayZone.rows.length ? todayZone.rows : rangeZone.rows, 'zone'),
        byCountry: topKeyed(todayCountry.rows, 'country'),
        byDevice: topKeyed(todayDevice.rows, 'device_type'),
        byDate: topKeyed(rangeDate.rows, 'date', 31).sort((a, b) => a.key.localeCompare(b.key)),
        bySite: topKeyed(rangeSite.rows, 'site'),
      };
      balance = bal;
    } catch {
      tokenCache = { access: '', exp: 0 };
      adcash = { ...emptyAc, error: 'unavailable' };
    }
  }

  const compare = {
    todayOurs: ours.today.views,
    todayAdcash: adcash.today.views,
    delta: ours.today.views - adcash.today.views,
    ratio: adcash.today.views > 0 ? ours.today.views / adcash.today.views : null,
    uniqueOurs: ours.today.uniqueVisitors,
    uniqueAdcash: adcash.today.uniqueUsers,
  };

  const body = {
    configured: !!token,
    generatedAt: Date.now(),
    day: today,
    ours,
    adcash,
    compare,
    balance,
    insights: buildInsights({
      ours,
      adcash,
      compare,
      balance,
      today,
      yesterday: adcash.yesterday,
    }),
  };

  payloadCache = { at: Date.now(), body };
  return res.json(body);
}
