export function createSecurityHeaders() {
  return (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    // Keep embeds/iframes working: do not lock script-src/frame-src here.
    // Harden the easy wins that do not break Scramjet, movies, or the SPA.
    res.setHeader(
      'Content-Security-Policy',
      [
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "form-action 'self'",
      ].join('; ')
    );
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=(self), display-capture=(self)'
    );
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
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
  const isProd = process.env.NODE_ENV === 'production';

  return {
    origin: (origin, cb) => {
      // Same-origin / non-browser clients (no Origin header)
      if (!origin) return cb(null, true);
      if (appUrl && origin === appUrl) return cb(null, true);
      if (allowed.length && allowed.includes(origin)) return cb(null, true);
      // Dev convenience only — never open CORS in production
      if (!isProd && !appUrl && allowed.length === 0) return cb(null, true);
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
