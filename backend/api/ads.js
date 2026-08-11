import rateLimit from 'express-rate-limit';
import fetch from 'node-fetch';
import { getClientIP } from '../utils/client-ip.js';
import { toIPv4 } from '../middleware/security.js';

const WINDOW_MS = 5 * 60 * 1000;
const MAX_PER_WINDOW = 2;
const CONTEXTS = new Set(['game', 'app', 'vm']);
const lastShown = new Map();
const MAX_KEYS = 20000;
const DEFAULT_VAST = 'https://youradexchange.com/video/select.php?r=11946186';
const MAX_VAST_HOPS = 4;
const MAX_VAST_BYTES = 512 * 1024;

export const adsGateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.session?.user?.id || toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ show: false, reason: 'rate_limit' }),
});

export const adsVastLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  keyGenerator: (req) => req.session?.user?.id || toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'rate_limit' }),
});

function prune() {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [k, stamps] of lastShown) {
    const next = (stamps || []).filter((t) => t > cutoff);
    if (next.length) lastShown.set(k, next);
    else lastShown.delete(k);
  }
  if (lastShown.size > MAX_KEYS) {
    const extra = lastShown.size - Math.floor(MAX_KEYS * 0.75);
    const keys = [...lastShown.keys()].slice(0, extra);
    for (const k of keys) lastShown.delete(k);
  }
}

function subjectKey(req) {
  if (req.session?.user?.id) return `u:${req.session.user.id}`;
  if (req.sessionID) return `s:${req.sessionID}`;
  const ip = getClientIP(req) || toIPv4(null, req) || 'anon';
  return `i:${ip}`;
}

function isAdcashEnabled() {
  const v = String(process.env.ADCASH_ENABLED ?? 'true').trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'no' && v !== 'off';
}

function vastUrl() {
  const raw = typeof process.env.ADCASH_VAST_URL === 'string'
    ? process.env.ADCASH_VAST_URL.trim()
    : '';
  return raw || DEFAULT_VAST;
}

function isHttpUrl(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function decodeXmlText(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function pickTag(xml, name) {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i');
  const m = String(xml || '').match(re);
  return m ? decodeXmlText(m[1]) : '';
}

function pickMedia(xml) {
  const files = [...String(xml || '').matchAll(/<MediaFile\b([^>]*)>([\s\S]*?)<\/MediaFile>/gi)];
  const parsed = files.map((m) => {
    const attrs = m[1] || '';
    const url = decodeXmlText(m[2]);
    const type = (attrs.match(/type=["']([^"']+)/i) || [])[1] || '';
    const w = Number((attrs.match(/width=["'](\d+)/i) || [])[1] || 0);
    const h = Number((attrs.match(/height=["'](\d+)/i) || [])[1] || 0);
    return { url, type, w, h };
  }).filter((f) => isHttpUrl(f.url));
  const mp4 = parsed.filter((f) => /mp4|video\/mp4/i.test(f.type) || /\.mp4(\?|$)/i.test(f.url));
  const pool = mp4.length ? mp4 : parsed;
  pool.sort((a, b) => (b.w * b.h) - (a.w * a.h));
  return pool[0]?.url || '';
}

async function fetchVastXml(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 4500);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { Accept: 'application/xml,text/xml,*/*' },
      redirect: 'follow',
    });
    if (!res.ok) return '';
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_VAST_BYTES) return '';
    return new TextDecoder('utf-8').decode(buf);
  } catch {
    return '';
  } finally {
    clearTimeout(t);
  }
}

async function resolveVast(startUrl) {
  let url = startUrl;
  for (let i = 0; i < MAX_VAST_HOPS; i++) {
    if (!isHttpUrl(url)) return { mediaUrl: '', clickThrough: '' };
    const xml = await fetchVastXml(url);
    if (!xml) return { mediaUrl: '', clickThrough: '' };
    const mediaUrl = pickMedia(xml);
    if (mediaUrl) {
      return { mediaUrl, clickThrough: pickTag(xml, 'ClickThrough') };
    }
    const next = pickTag(xml, 'VASTAdTagURI');
    if (!next) return { mediaUrl: '', clickThrough: pickTag(xml, 'ClickThrough') };
    url = next;
  }
  return { mediaUrl: '', clickThrough: '' };
}

export async function adsGateHandler(req, res) {
  if (!isAdcashEnabled()) {
    return res.json({ show: false, reason: 'disabled' });
  }

  const context = typeof req.body?.context === 'string'
    ? req.body.context.trim().toLowerCase()
    : '';
  if (!CONTEXTS.has(context)) {
    return res.status(400).json({ show: false, reason: 'invalid_context' });
  }

  prune();
  const key = subjectKey(req);
  const now = Date.now();
  const stamps = (lastShown.get(key) || []).filter((t) => now - t < WINDOW_MS);

  if (stamps.length >= MAX_PER_WINDOW) {
    const oldest = Math.min(...stamps);
    return res.json({
      show: false,
      reason: 'cooldown',
      retryAfterMs: WINDOW_MS - (now - oldest),
      cooldownMs: WINDOW_MS,
    });
  }

  lastShown.set(key, stamps);

  return res.json({
    show: true,
    context,
    cooldownMs: WINDOW_MS,
    maxMs: 15000,
  });
}

export async function adsShownHandler(req, res) {
  if (!isAdcashEnabled()) {
    return res.json({ ok: true });
  }
  prune();
  const key = subjectKey(req);
  const now = Date.now();
  const stamps = (lastShown.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (stamps.length < MAX_PER_WINDOW) stamps.push(now);
  lastShown.set(key, stamps);
  return res.json({ ok: true });
}

export async function adsVastHandler(_req, res) {
  if (!isAdcashEnabled()) {
    return res.json({ mediaUrl: '', clickThrough: '' });
  }
  try {
    const data = await resolveVast(vastUrl());
    res.setHeader('Cache-Control', 'no-store');
    return res.json(data);
  } catch {
    return res.json({ mediaUrl: '', clickThrough: '' });
  }
}
