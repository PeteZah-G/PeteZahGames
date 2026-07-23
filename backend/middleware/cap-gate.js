import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasValidGate } from '../cap/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERIFY_FILE = path.join(__dirname, '../../public/verify.html');

const OPEN_EXACT = new Set([
  '/verify',
  '/verify.html',
  '/logo.png',
  '/favicon.ico',
  '/robots.txt',
  '/firefox-wasm/thanks.html',
]);

const OPEN_PREFIX = ['/cap/', '/api/verify-email'];

function isOpenPath(p) {
  if (OPEN_EXACT.has(p)) return true;
  for (const pre of OPEN_PREFIX) {
    if (p === pre.slice(0, -1) || p.startsWith(pre)) return true;
  }
  return false;
}

function wantsHtml(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const accept = req.headers.accept || '';
  if (accept.includes('text/html')) return true;
  const ext = path.extname(req.path || '');
  return !ext || ext === '.html';
}

export function createCapGateMiddleware() {
  return (req, res, next) => {
    const p = req.path || '';
    if (isOpenPath(p)) return next();
    if (hasValidGate(req)) return next();

    if (p.startsWith('/api/') || p.startsWith('/!!/') || p.startsWith('/!cover!/')) {
      return res.status(403).json({ error: 'Verification required' });
    }

    if (wantsHtml(req)) {
      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(302, '/verify');
    }

    if (p.startsWith('/assets/') || p.endsWith('.js') || p.endsWith('.css') || p.endsWith('.map')) {
      return res.status(403).end();
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, '/verify');
  };
}

export function sendVerifyPage(_req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.sendFile(VERIFY_FILE);
}

export function requireGateUpgrade(req) {
  return hasValidGate(req);
}
