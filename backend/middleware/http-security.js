export function createSecurityHeaders() {
  return (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  };
}

export function createCorsConfig() {
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const appUrl = (process.env.APP_URL || process.env.PUBLIC_URL || '').replace(/\/$/, '');

  return {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (appUrl && origin === appUrl) return cb(null, true);
      if (allowed.length && allowed.includes(origin)) return cb(null, true);
      if (!appUrl && allowed.length === 0) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  };
}

export function createUploadGuard() {
  return (req, res, next) => {
    const normalized = req.path.replace(/\.\./g, '');
    if (normalized !== req.path) return res.status(400).end();
    next();
  };
}
