import {
  enforceElevatedSession,
  isAuth2faExemptPath,
  sessionMustSetup2fa,
  sessionNeedsTotp,
} from '../utils/elevated-auth.js';

/**
 * Global API gate: elevated accounts must complete 2FA (or enroll it)
 * before touching anything beyond the allowlisted auth endpoints.
 */
export function elevated2faGate(req, res, next) {
  const path = req.baseUrl && req.path
    ? `${req.baseUrl}${req.path}`.replace(/\/{2,}/g, '/')
    : req.originalUrl?.split('?')[0] || req.path;

  const fullPath = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`;

  try {
    const result = enforceElevatedSession(req);
    if (!result.ok) {
      const send = () => res.status(result.status).json(result.body);
      if (typeof req.session?.save === 'function') {
        return req.session.save(() => send());
      }
      return send();
    }

    const continueNext = () => {
      if (sessionNeedsTotp(req)) {
        if (!isAuth2faExemptPath(req.method, fullPath)) {
          return res.status(401).json({
            error: 'Two-factor authentication required',
            code: 'REQUIRES_2FA',
          });
        }
        return next();
      }

      if (sessionMustSetup2fa(req) || result.mustSetup2fa) {
        if (!isAuth2faExemptPath(req.method, fullPath)) {
          return res.status(403).json({
            error: 'Set up two-factor authentication to continue',
            code: 'MUST_SETUP_2FA',
          });
        }
      }

      return next();
    };

    if (typeof req.session?.save === 'function') {
      return req.session.save((err) => {
        if (err) {
          console.error('elevated 2fa gate save error:', err);
          return res.status(500).json({ error: 'Internal server error' });
        }
        return continueNext();
      });
    }
    return continueNext();
  } catch (err) {
    console.error('elevated 2fa gate error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
