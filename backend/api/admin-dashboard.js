import bcrypt from 'bcrypt';
import db from '../db.js';
import { isOwnerEmail } from '../utils/auth-roles.js';
import { getShield } from '../utils/shield-ref.js';
import { systemState } from '../middleware/security.js';
import { getApiLatencyStats, getMemoryStats, sampleCpuPercent, recordApiLatency } from '../utils/runtime-metrics.js';
import { getUsageCounts } from '../utils/usage-daily.js';

let getXDPBlockCount = () => 0;
try {
  const xdp = await import('../security/xdp-integration.js');
  getXDPBlockCount = xdp.getXDPBlockCount;
} catch {}

const userStatsStmt = db.prepare(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS newToday,
    SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS newWeek,
    SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS newMonth,
    SUM(CASE WHEN email_verified = 1 THEN 1 ELSE 0 END) AS verified
  FROM users
`);

let overviewCache = { at: 0, body: null };
const OVERVIEW_TTL_MS = 5000;

export function invalidateAdminOverviewCache() {
  overviewCache = { at: 0, body: null };
}

function requireAdminSession(req, res, { needHash = false } = {}) {
  if (!req.session?.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  if (req.session.must_setup_2fa || req.session.user.must_setup_2fa || !req.session.totpOk) {
    res.status(403).json({
      error: 'Two-factor authentication required',
      code: req.session.must_setup_2fa || req.session.user.must_setup_2fa ? 'MUST_SETUP_2FA' : 'REQUIRES_2FA',
    });
    return null;
  }
  const cols = needHash
    ? 'id, email, password_hash, is_admin, totp_enabled, banned'
    : 'id, email, is_admin, totp_enabled, banned';
  const row = db.prepare(`SELECT ${cols} FROM users WHERE id = ?`).get(req.session.user.id);
  if (!row || row.banned) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const owner = isOwnerEmail(row.email);
  let level = row.is_admin || 0;
  if (owner && level < 3) {
    db.prepare('UPDATE users SET is_admin = 3 WHERE id = ?').run(row.id);
    level = 3;
  }
  if (level < 1 && !owner) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  if (!row.totp_enabled) {
    res.status(403).json({ error: 'Set up two-factor authentication to continue', code: 'MUST_SETUP_2FA' });
    return null;
  }
  req.session.user.is_admin = Math.max(level, owner ? 3 : level);
  req.session.user.is_owner = owner;
  return { id: row.id, email: row.email, password_hash: row.password_hash, is_admin: req.session.user.is_admin, is_owner: owner };
}

async function requireOwnerPassword(req, res) {
  const admin = requireAdminSession(req, res, { needHash: true });
  if (!admin) return null;
  if (!admin.is_owner) {
    res.status(403).json({ error: 'Owner only' });
    return null;
  }
  if (typeof req.body?.enabled !== 'boolean') {
    res.status(400).json({ error: 'Invalid request' });
    return null;
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password || password.length < 8 || password.length > 256) {
    await new Promise((r) => setTimeout(r, 150 + Math.floor(Math.random() * 150)));
    res.status(401).json({ error: 'Invalid password' });
    return null;
  }
  if (!admin.password_hash) {
    res.status(401).json({ error: 'Invalid password' });
    return null;
  }
  const match = await bcrypt.compare(password, admin.password_hash);
  if (!match) {
    await new Promise((r) => setTimeout(r, 150 + Math.floor(Math.random() * 150)));
    res.status(401).json({ error: 'Invalid password' });
    return null;
  }
  return admin;
}

function dayBounds(offsetDays = 0) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.getTime();
}

function probeDb() {
  const start = process.hrtime.bigint();
  try {
    db.prepare('SELECT 1 AS ok').get();
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    return { ok: true, latencyMs: Math.round(ms * 100) / 100 };
  } catch {
    return { ok: false, latencyMs: null };
  }
}

function buildOverview() {
  const now = Date.now();
  const startToday = dayBounds(0);
  const startWeek = dayBounds(-7);
  const startMonth = dayBounds(-30);
  const row = userStatsStmt.get(startToday, startWeek, startMonth) || {};
  const total = row.total || 0;
  const verified = row.verified || 0;
  const users = {
    total,
    newToday: row.newToday || 0,
    newWeek: row.newWeek || 0,
    newMonth: row.newMonth || 0,
    verified,
    unverified: Math.max(0, total - verified),
  };

  const usage = getUsageCounts();
  const shield = getShield();
  let cpu = 0;
  try {
    cpu = typeof shield?.getCpuUsage === 'function'
      ? Math.round(Number(shield.getCpuUsage()) * 10) / 10
      : sampleCpuPercent();
  } catch {
    cpu = sampleCpuPercent();
  }

  const security = {
    attackMode: !!(shield?.forceAttackMode || systemState.state === 'ATTACK'),
    forceAttackMode: !!shield?.forceAttackMode,
    killSwitch: !!shield?.isKillSwitchActive?.(),
    systemState: systemState.state || 'NORMAL',
    underAttack: !!shield?.isUnderAttack,
    powDifficulty: systemState.currentPowDifficulty || 0,
    requestRatePerMinute: systemState.requestRatePerMinute || 0,
    activeConnections: systemState.activeConnections || 0,
    totalWS: systemState.totalWS || 0,
    blockRate: typeof shield?.getRecentBlockRate === 'function' ? shield.getRecentBlockRate() : 0,
    mitigatedCount: shield?.mitigatedCount || 0,
  };

  return {
    generatedAt: now,
    uptimeSec: Math.floor(process.uptime()),
    users,
    usage,
    system: {
      cpuPercent: Number.isFinite(cpu) ? cpu : 0,
      memory: getMemoryStats(),
      latency: getApiLatencyStats(),
      db: probeDb(),
      cache: {
        status: 'local',
        compression: true,
        xdpBlocks: getXDPBlockCount() || 0,
      },
    },
    security,
  };
}

export async function getAdminOverviewHandler(req, res) {
  const admin = requireAdminSession(req, res);
  if (!admin) return;

  const t0 = process.hrtime.bigint();
  try {
    const now = Date.now();
    if (overviewCache.body && now - overviewCache.at < OVERVIEW_TTL_MS) {
      return res.json({ ...overviewCache.body, isOwner: !!admin.is_owner });
    }
    const body = buildOverview();
    overviewCache = { at: now, body };
    recordApiLatency(Number(process.hrtime.bigint() - t0) / 1e6);
    return res.json({ ...body, isOwner: !!admin.is_owner });
  } catch (err) {
    console.error('admin overview error:', err);
    return res.status(500).json({ error: 'Failed to load overview' });
  }
}

export async function setAttackModeHandler(req, res) {
  const admin = await requireOwnerPassword(req, res);
  if (!admin) return;

  const enabled = req.body.enabled === true;
  const shield = getShield();
  if (!shield || typeof shield.setForceAttackMode !== 'function') {
    return res.status(503).json({ error: 'Shield unavailable' });
  }

  shield.setForceAttackMode(enabled, systemState);
  invalidateAdminOverviewCache();
  console.warn(`[SECURITY] Attack mode ${enabled ? 'ON' : 'OFF'} by owner ${admin.email}`);

  return res.json({
    ok: true,
    attackMode: enabled,
    forceAttackMode: !!shield.forceAttackMode,
    systemState: systemState.state,
  });
}

export async function setKillSwitchHandler(req, res) {
  const admin = await requireOwnerPassword(req, res);
  if (!admin) return;

  const enabled = req.body.enabled === true;
  const shield = getShield();
  if (!shield || typeof shield.setKillSwitch !== 'function') {
    return res.status(503).json({ error: 'Shield unavailable' });
  }

  shield.setKillSwitch(enabled, { hardExit: false });
  invalidateAdminOverviewCache();
  console.warn(`[SECURITY] Kill switch ${enabled ? 'ON' : 'OFF'} by owner ${admin.email}`);

  return res.json({
    ok: true,
    killSwitch: !!shield.isKillSwitchActive(),
  });
}
