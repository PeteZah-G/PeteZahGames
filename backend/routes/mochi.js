import { createProxyMiddleware } from 'http-proxy-middleware';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { toIPv4, extractToken, verifyToken, updateIPReputation } from '../middleware/security.js';

const router = Router();

const coverCache = new Map();
const COVER_CACHE_TTL = 2 * 60 * 60 * 1000;
const COVER_CACHE_MAX = 5000;

function getCoverCached(key) {
  const entry = coverCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { coverCache.delete(key); return null; }
  return entry;
}

function setCoverCache(key, body, headers) {
  if (coverCache.size >= COVER_CACHE_MAX) coverCache.delete(coverCache.keys().next().value);
  coverCache.set(key, { body, headers, expires: Date.now() + COVER_CACHE_TTL });
}

const mochiLimiter = rateLimit({
  windowMs: 60000,
  max: (req) => {
    if (req.session?.user?.id) return 10000;
    const token = extractToken(req);
    if (verifyToken(token, req)) return 6000;
    return 1000;
  },
  keyGenerator: (req) => {
    if (req.session?.user?.id) return `user:${req.session.user.id}`;
    const token = extractToken(req);
    if (verifyToken(token, req)) return `token:${token.slice(0, 16)}`;
    return toIPv4(null, req);
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const ref = req.headers['referer'] || '';
    return ref.includes('/!!/') || ref.includes('/!cover!/');
  },
  handler: (req, res) => {
    updateIPReputation(toIPv4(null, req), -1);
    res.status(429).json({ error: 'Too many proxy requests' });
  },
});

const mochiProxy = createProxyMiddleware({
  target: 'http://localhost:3005',
  changeOrigin: false,
  ws: false,
  on: {
    error: (err, req, res) => {
      if (res && 'status' in res) {
        res.status(502).send('Proxy unavailable');
      }
    },
  },
});

function coverCacheMiddleware(req, res, next) {
  if (req.method !== 'GET') return next();
  const key = req.originalUrl;
  const cached = getCoverCached(key);
  if (cached) {
    const ct = cached.headers['content-type'];
    if (ct) res.setHeader('Content-Type', ct);
    res.setHeader('X-Cover-Cache', 'HIT');
    res.setHeader('Cache-Control', 'public, max-age=7200');
    return res.send(cached.body);
  }
  const chunks = [];
  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);
  res.write = (chunk, ...args) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return origWrite(chunk, ...args);
  };
  res.end = (chunk, ...args) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    if (res.statusCode === 200 && chunks.length) {
      const body = Buffer.concat(chunks);
      if (body.length < 5 * 1024 * 1024) {
        setCoverCache(key, body, { 'content-type': res.getHeader('content-type') });
      }
    }
    return origEnd(chunk, ...args);
  };
  next();
}

router.use('/!cover!/', mochiLimiter, coverCacheMiddleware, mochiProxy);
router.use('/!!/', mochiLimiter, mochiProxy);

export default router;
export { mochiProxy };