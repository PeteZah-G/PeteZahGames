import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import * as OTPAuth from 'otpauth';

function totpKey() {
  return createHash('sha256')
    .update(String(process.env.SESSION_SECRET || process.env.TOKEN_SECRET || 'petezah-totp'))
    .digest();
}

export function encryptTotpSecret(plain) {
  if (!plain) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', totpKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`;
}

export function decryptTotpSecret(stored) {
  if (!stored) return null;
  if (!String(stored).startsWith('v1:')) return normalizeBase32(String(stored));
  const parts = String(stored).split(':');
  if (parts.length !== 4) return null;
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const data = Buffer.from(parts[3], 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', totpKey(), iv);
    decipher.setAuthTag(tag);
    return normalizeBase32(
      Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
    );
  } catch {
    return null;
  }
}

/** Google Authenticator expects uppercase base32 without spaces. */
export function normalizeBase32(secret) {
  if (typeof secret !== 'string') return '';
  return secret.replace(/[\s\-]/g, '').toUpperCase().replace(/=+$/, '');
}

export function makeTotp(secretBase32, email) {
  const cleaned = normalizeBase32(secretBase32);
  return new OTPAuth.TOTP({
    issuer: 'PeteZah',
    label: String(email || 'account').slice(0, 128),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(cleaned),
  });
}

export function verifyTotpCode(secretBase32, code, email) {
  const token = normalizeTotpCode(code);
  if (!/^\d{6}$/.test(token)) return false;
  try {
    const totp = makeTotp(secretBase32, email);
    // window 2 = ±60s — tolerates phone/server clock drift
    const delta = totp.validate({ token, window: 2 });
    return delta !== null;
  } catch {
    return false;
  }
}

export function generateTotpSecret() {
  return new OTPAuth.Secret({ size: 20 });
}

export function normalizeTotpCode(code) {
  if (typeof code === 'string') return code.replace(/\D/g, '').slice(0, 6);
  if (typeof code === 'number' && Number.isFinite(code)) {
    return String(Math.trunc(Math.abs(code))).padStart(6, '0').slice(-6);
  }
  return '';
}
