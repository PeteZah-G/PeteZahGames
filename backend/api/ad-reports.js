import rateLimit from 'express-rate-limit';
import fetch from 'node-fetch';
import db from '../db.js';
import { isOwnerEmail } from '../utils/auth-roles.js';
import { toIPv4 } from '../middleware/security.js';

const EXO_BASE = 'https://api.exoclick.com/v2';
const CACHE_MS = 120000;
const FETCH_MS = 10000;
const MAX_ROWS = 80;

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
  const raw = process.env.EXOCLICK_API_TOKEN || '';
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
  const earnings = num(row?.revenue ?? row?.earnings);
  const videoImps = num(video.impressions);
  const videoViews = num(video.views);
  const views = videoViews || videoImps || impressions;
  const ctr = num(row?.ctr) || (views > 0 ? clicks / views : 0);
  const ecpm = num(row?.cpm) || (views > 0 ? (earnings / views) * 1000 : 0);
  const vtr = num(video.vtr) || (videoImps > 0 ? videoViews / videoImps : 0);
  return {
    impressions,
    clicks,
    earnings,
    videoViews,
    views,
    ctr,
    ecpm,
    vtr,
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
    if (key === 'date') return clipStr(row?.date || '');
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
  return groupLabel(row, 'date') || clipStr(row?.date || '');
}

async function exoFetch(path, { method = 'GET', token = '', body } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_MS);
  try {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(`${EXO_BASE}${path}`, {
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
  const res = await exoFetch('/login', {
    method: 'POST',
    body: { api_token: apiToken },
  });
  const access = res.data?.token || res.data?.data?.token || res.data?.access_token;
  const expiresIn = num(res.data?.expires_in || res.data?.data?.expires_in || 900);
  if (res.ok && typeof access === 'string' && access.length > 8 && access.length < 8000) {
    tokenCache = { access, exp: Date.now() + Math.min(Math.max(expiresIn, 60), 900) * 1000 };
    return tokenCache.access;
  }
  throw new Error('auth');
}

async function fetchStats(token, start, end, groupBy) {
  const body = {
    detailed: 1,
    totals: 1,
    filter: { date_from: start, date_to: end },
    group_by: [groupBy],
    order_by: [{ field: 'impressions', order: 'desc' }],
    projection: { base: ['*'], video: ['*'] },
    limit: 80,
    offset: 0,
  };
  let res = await exoFetch('/statistics/p/', { method: 'POST', token, body });
  if (!res.ok) {
    res = await exoFetch('/statistics/publisher', { method: 'POST', token, body });
  }
  if (!res.ok || !res.data) return [];
  const rows = Array.isArray(res.data.result)
    ? res.data.result
    : Array.isArray(res.data.data)
      ? res.data.data
      : [];
  return rows.slice(0, MAX_ROWS * 4);
}

async function fetchBalance(token) {
  const paths = ['/user', '/users/me', '/payments'];
  for (const path of paths) {
    const res = await exoFetch(path, { token });
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
  if (oursToday === 0 && exoToday === 0) {
    out.push({
      tone: 'info',
      title: 'No views yet today',
      body: 'Neither PeteZah nor ExoClick has counted a video ad view today. That is normal early in the day or if traffic is light.',
    });
  } else if (exoToday === 0 && oursToday > 0) {
    out.push({
      tone: 'warn',
      title: 'We counted views ExoClick has not',
      body: `PeteZah recorded ${oursToday} started ads today, but ExoClick reports 0. Reporting often lags, or the VAST tag is not attributing to this publisher account.`,
    });
  } else if (oursToday === 0 && exoToday > 0) {
    out.push({
      tone: 'warn',
      title: 'ExoClick sees views we do not',
      body: `ExoClick reports ${exoToday} today while our overlay tracker is at 0. Those views may be coming from another placement, or /api/ads/shown is not firing on ad start.`,
    });
  } else {
    const gap = Math.abs(compare.delta);
    const pct = compare.ratio;
    if (pct >= 0.7 && pct <= 1.4) {
      out.push({
        tone: 'good',
        title: 'Counts are aligned',
        body: `Today we recorded ${oursToday} started ads vs ExoClick ${exoToday} (${Math.round(pct * 100)}%). Small gaps are expected from skip-before-start and reporting delay.`,
      });
    } else {
      out.push({
        tone: 'warn',
        title: 'View counts diverge',
        body: `PeteZah ${oursToday} vs ExoClick ${exoToday} (gap ${gap}). If ours is higher, many players start then no-fill. If ExoClick is higher, extra inventory is running outside this overlay.`,
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

  if (exoclick.today.ecpm > 0) {
    const vs7 = exoclick.d7.views > 0 ? exoclick.d7.ecpm : 0;
    if (vs7 > 0 && exoclick.today.ecpm > vs7 * 1.25) {
      out.push({
        tone: 'good',
        title: 'eCPM is running hot',
        body: `Today eCPM ${exoclick.today.ecpm.toFixed(2)} vs 7-day ${vs7.toFixed(2)}. Keep the same zones in rotation.`,
      });
    } else if (vs7 > 0 && exoclick.today.ecpm < vs7 * 0.7) {
      out.push({
        tone: 'warn',
        title: 'eCPM is soft today',
        body: `Today eCPM ${exoclick.today.ecpm.toFixed(2)} is below the 7-day ${vs7.toFixed(2)}. Mix or geo may be cheaper inventory.`,
      });
    } else {
      out.push({
        tone: 'info',
        title: 'eCPM snapshot',
        body: `Today ${exoclick.today.ecpm.toFixed(2)} ${exoclick.currency}/mille. 7-day ${vs7.toFixed(2)}.`,
      });
    }
  }

  if (exoclick.today.vtr > 0) {
    out.push({
      tone: exoclick.today.vtr >= 0.7 ? 'good' : 'info',
      title: 'Video completion',
      body: `VTR ${(exoclick.today.vtr * 100).toFixed(1)}% · ${exoclick.today.videoViews} completed views. Completions pay more than skips.`,
    });
  }

  if (exoclick.today.ctr > 0) {
    out.push({
      tone: exoclick.today.ctr >= 0.01 ? 'good' : 'info',
      title: 'Click-through',
      body: `CTR ${(exoclick.today.ctr * 100).toFixed(2)}% on ${exoclick.today.clicks} clicks. Video CTR is usually low; earnings still come from completed views.`,
    });
  }

  const yEarn = yesterday.earnings;
  const tEarn = exoclick.today.earnings;
  if (yEarn > 0) {
    const ch = (tEarn - yEarn) / yEarn;
    out.push({
      tone: ch >= 0 ? 'good' : 'info',
      title: 'Earnings vs yesterday',
      body: `Today ${tEarn.toFixed(2)} ${exoclick.currency} vs yesterday ${yEarn.toFixed(2)} (${ch >= 0 ? '+' : ''}${Math.round(ch * 100)}%). Incomplete until end of day.`,
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
      body: `Zone ${z.key} leads with ${z.earnings.toFixed(2)} ${exoclick.currency} and ${z.views} views (eCPM ${z.ecpm.toFixed(2)}).`,
    });
  }

  if (exoclick.byCountry[0]) {
    const c = exoclick.byCountry[0];
    const share = exoclick.today.views > 0 ? c.views / exoclick.today.views : 0;
    out.push({
      tone: share > 0.55 ? 'warn' : 'info',
      title: 'Top country',
      body: `${c.key} is ${Math.round(share * 100)}% of ExoClick views today. ${share > 0.55 ? 'Heavy concentration — revenue will swing with that geo.' : 'Spread looks healthier than a single-geo stack.'}`,
    });
  }

  if (exoclick.byDevice[0]) {
    const d = exoclick.byDevice[0];
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
      body: `${String(peak.hour).padStart(2, '0')}:00 UTC had ${peak.views} started ads.`,
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
      body: `${balance.amount.toFixed(2)} ${balance.currency}.${balance.amount < 10 ? ' Low balance — confirm payout threshold in ExoClick.' : ''}`,
    });
  }

  const d7avg = exoclick.d7.earnings / 7;
  if (d7avg > 0) {
    out.push({
      tone: 'info',
      title: '7-day run rate',
      body: `${exoclick.d7.earnings.toFixed(2)} ${exoclick.currency} over 7 days (~${d7avg.toFixed(2)}/day). 30-day total ${exoclick.d30.earnings.toFixed(2)}.`,
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
      const access = await getAccessToken(token);
      const [todayDate, todayZone, todayCountry, todayDevice, rangeDate, rangeZone, rangeSite, bal] = await Promise.all([
        fetchStats(access, today, today, 'date'),
        fetchStats(access, today, today, 'zone_id'),
        fetchStats(access, today, today, 'country_iso'),
        fetchStats(access, today, today, 'device_type_id'),
        fetchStats(access, d30, today, 'date'),
        fetchStats(access, d30, today, 'zone_id'),
        fetchStats(access, d30, today, 'site_id'),
        fetchBalance(access),
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
    } catch {
      tokenCache = { access: '', exp: 0 };
      exoclick = { ...emptyNet, error: 'unavailable' };
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
