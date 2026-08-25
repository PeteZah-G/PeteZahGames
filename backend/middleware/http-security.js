export function isJsdelivrOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    // only cdn/content subdomains, not the bare apex (that's the marketing site,
    // never a shell host) - keeps the credentialed-cors surface tighter
    return h.endsWith('.jsdelivr.net');
  } catch {
    return false;
  }
}

export function crossSiteCookieFlags(req) {
  const origin = req?.headers?.origin || '';
  const cdn = isJsdelivrOrigin(origin);
  return {
    httpOnly: true,
    path: '/',
    secure: process.env.NODE_ENV === 'production' || cdn,
    sameSite: cdn ? 'none' : 'lax',
    ...(cdn ? { partitioned: true } : {}),
  };
}

export function wrapCrossSiteCookies() {
  return (req, res, next) => {
    if (!isJsdelivrOrigin(req.headers.origin)) return next();
    const orig = res.cookie.bind(res);
    res.cookie = (name, value, options = {}) =>
      orig(name, value, {
        ...options,
        sameSite: 'none',
        secure: true,
        partitioned: true,
      });
    next();
  };
}

export function createSecurityHeaders() {
  return (req, res, next) => {
    const p = req.path || '';
    const remoteFrame =
      p === '/storage/ag' ||
      p.startsWith('/storage/ag/') ||
      p.startsWith('/n/m/') ||
      p.startsWith('/!!/') ||
      p.startsWith('/!cover!/');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!remoteFrame) res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader(
      'Content-Security-Policy',
      [
        remoteFrame
          ? "frame-ancestors 'self' https://cdn.jsdelivr.net https://*.jsdelivr.net"
          : "frame-ancestors 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "form-action 'self'",
        "upgrade-insecure-requests",
      ].join('; ')
    );
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=(self), display-capture=(self), interest-cohort=()'
    );
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    next();
  };
}

export function createCorsConfig() {
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const appUrl = (process.env.APP_URL || process.env.PUBLIC_URL || process.env.BASE_URL || '')
    .replace(/\/$/, '');
  const isProd = process.env.NODE_ENV === 'production';

  return {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (appUrl && origin === appUrl) return cb(null, true);
      if (isJsdelivrOrigin(origin)) return cb(null, true);
      if (allowed.length && allowed.includes(origin)) return cb(null, true);
      if (!isProd && !appUrl && allowed.length === 0) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-PZ-Gate',
      'X-PZ-Legal',
      'X-PZ-Session',
      'X-PZ-Svg',
    ],
  };
}

export function createUploadGuard() {
  return (req, res, next) => {
    const normalized = req.path.replace(/\.\./g, '');
    if (normalized !== req.path) return res.status(400).end();
    next();
  };
}
