import { createProxyMiddleware } from 'http-proxy-middleware';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { toIPv4, extractToken, verifyToken, updateIPReputation } from '../middleware/security.js';
import { toMochiBackendPath } from '../mochi-path.js';

const router = Router();

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
    return ref.includes('/f/g/') || ref.includes('/n/m/') || ref.includes('/!!/') || ref.includes('/!cover!/') || ref.includes('/f/c/');
  },
  handler: (req, res) => {
    updateIPReputation(toIPv4(null, req), -1);
    res.status(429).json({ error: 'Too many proxy requests' });
  },
});

const mochiProxy = createProxyMiddleware({
  target: 'http://127.0.0.1:3005',
  changeOrigin: false,
  ws: false,
  pathRewrite: (path) => toMochiBackendPath(path),
  on: {
    error: (err, req, res) => {
      if (res && 'status' in res) {
        res.status(502).send('Proxy unavailable');
      }
    },
  },
});

router.use('/f/c/', mochiLimiter, mochiProxy);
router.use('/!cover!/', mochiLimiter, mochiProxy);
router.use('/f/g/', mochiLimiter, mochiProxy);
router.use('/n/m/', mochiLimiter, mochiProxy);
router.use('/!!/', mochiLimiter, mochiProxy);

export default router;
export { mochiProxy };
