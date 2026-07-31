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
  if (!String(stored).startsWith('v1:')) return String(stored);
  const parts = String(stored).split(':');
  if (parts.length !== 4) return null;
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const data = Buffer.from(parts[3], 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', totpKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function makeTotp(secretBase32, email) {
  return new OTPAuth.TOTP({
    issuer: 'PeteZah',
    label: email || 'account',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

export function verifyTotpCode(secretBase32, code, email) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) return false;
  try {
    const totp = makeTotp(secretBase32, email);
    const delta = totp.validate({ token: code.trim(), window: 1 });
    return delta !== null;
  } catch {
    return false;
  }
}

export function generateTotpSecret() {
  return new OTPAuth.Secret({ size: 20 });
}

export function normalizeTotpCode(code) {
  return typeof code === 'string' ? code.replace(/\s+/g, '').trim() : '';
}
