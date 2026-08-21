const MIN_SECRET_LEN = 24;

function readSecret(name) {
  const v = process.env[name];
  return typeof v === 'string' ? v.trim() : '';
}

export function getRequiredSecret(name, { minLength = MIN_SECRET_LEN } = {}) {
  const v = readSecret(name);
  if (!v || v.length < minLength) {
    throw new Error(`${name} must be set (${minLength}+ characters)`);
  }
  return v;
}

/** Prefer SESSION_SECRET, then TOKEN_SECRET. Never a hardcoded fallback.  Security stuff */
export function getAppPepper(purpose = 'app') {
  const session = readSecret('SESSION_SECRET');
  const token = readSecret('TOKEN_SECRET');
  const v = session || token;
  if (!v || v.length < MIN_SECRET_LEN) {
    throw new Error(`SESSION_SECRET or TOKEN_SECRET required for ${purpose}`);
  }
  return v;
}

export function assertProductionSecrets() {
  getRequiredSecret('TOKEN_SECRET', { minLength: 24 });
  if (process.env.NODE_ENV === 'production') {
    getRequiredSecret('SESSION_SECRET', { minLength: 24 });
    const admin = readSecret('ADMIN_EMAIL');
    if (!admin || !admin.includes('@')) {
      throw new Error('ADMIN_EMAIL must be set to a valid owner email in production');
    }
  }
  if (!readSecret('TMDB_API_KEY')) {
    throw new Error('TMDB_API_KEY must be set');
  }
}
