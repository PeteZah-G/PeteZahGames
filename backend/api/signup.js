import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { getClientIP } from '../utils/client-ip.js';
import { isOwnerEmail } from '../utils/auth-roles.js';
import { isIpBanned } from '../middleware/ip-ban.js';
import { sendUserVerificationEmail } from './verify-email.js';

const requestTimestamps = new Map();
const suspiciousIPs = new Map();
const BCRYPT_ROUNDS = 12;

function normalizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase().slice(0, 254);
}

function validatePassword(password) {
  if (typeof password !== 'string') return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 128) return 'Password is too long.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include at least one letter and one number.';
  }
  return null;
}

function validateRequest(req, body) {
  const ip = getClientIP(req);
  const userAgent = req.headers['user-agent'] || '';
  const contentType = req.headers['content-type'] || '';

  if (body.website && body.website.trim() !== '') return false;
  if (!userAgent || userAgent.length < 10) return false;

  const botPatterns = [/curl|wget|python-requests|java\/|go-http|libwww-perl|scrapy/i];
  if (botPatterns.some((p) => p.test(userAgent))) return false;

  if (!contentType.includes('application/json')) return false;

  const now = Date.now();
  const ipKey = `signup_${ip}`;
  const lastRequest = requestTimestamps.get(ipKey) || 0;

  if (now - lastRequest < 2000) {
    const count = suspiciousIPs.get(ip) || 0;
    suspiciousIPs.set(ip, count + 1);
    if (count > 5) return false;
  }

  requestTimestamps.set(ipKey, now);
  setTimeout(() => requestTimestamps.delete(ipKey), 60000);
  return true;
}

export async function signupHandler(req, res) {
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const { school, age, website } = req.body || {};

  const clientIp = getClientIP(req);
  if (clientIp && isIpBanned(clientIp)) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return res.status(400).json({ error: 'Invalid email address.' });

  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });

  if (!validateRequest(req, { website })) {
    return res.status(400).json({ error: 'Signup failed. Please try again.' });
  }

  try {
    const existingUser = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email);
    if (existingUser) return res.status(400).json({ error: 'An account with this email already exists.' });

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const userId = randomUUID();
    const now = Date.now();
    const ip = clientIp || 'unknown';

    const isFirstUser = db.prepare('SELECT COUNT(*) AS count FROM users').get().count === 0;
    const isAdmin = isFirstUser || isOwnerEmail(email);

    db.prepare(`
      INSERT INTO users (id, email, password_hash, created_at, updated_at, is_admin, email_verified, school, age, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, email, passwordHash, now, now, isAdmin ? 1 : 0, 0, school || null, age || null, ip);

    let emailSent = true;
    try {
      await sendUserVerificationEmail(req, userId, email);
    } catch (err) {
      console.error('Signup verification email failed:', err);
      emailSent = false;
    }

    res.status(201).json({
      message: emailSent
        ? 'Account created! Check your email to verify before signing in.'
        : 'Account created, but we could not send the verification email. Use Resend verification from the sign-in screen.',
      emailSent,
      needsVerification: true,
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Signup failed. Please try again.' });
  }
}
