import db from '../db.js';
import { isOwnerEmail } from '../utils/auth-roles.js';
import { getClientIP } from '../utils/client-ip.js';
import { banIp, unbanIp } from '../middleware/ip-ban.js';
import { blockIPKernel } from '../security/xdp-integration.js';

export async function adminUserActionHandler(req, res) {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });

  const admin = db.prepare('SELECT is_admin, email FROM users WHERE id = ?').get(req.session.user.id);
  if (!admin) return res.status(403).json({ error: 'Forbidden' });

  const isOwner = isOwnerEmail(admin.email);
  if (admin.is_admin < 1 && !isOwner) return res.status(403).json({ error: 'Admin access required' });

  const { userId, action } = req.body;
  const allowed = ['suspend', 'staff', 'promote_mod', 'delete', 'ban', 'unban', 'promote_admin', 'demote_admin'];
  if (!userId || !allowed.includes(action)) return res.status(400).json({ error: 'Invalid request' });
  if (userId === req.session.user.id) return res.status(400).json({ error: 'Cannot manage yourself' });

  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (isOwnerEmail(target.email)) return res.status(403).json({ error: 'Cannot manage the owner.' });

  const roleActions = ['promote_admin', 'demote_admin', 'staff', 'promote_mod'];
  if (roleActions.includes(action) && !isOwner) {
    return res.status(403).json({ error: 'Only the owner can manage staff and admin roles.' });
  }

  if (action === 'staff') {
    db.prepare('UPDATE users SET is_admin = 2 WHERE id = ?').run(userId);
    return res.json({ message: 'User promoted to staff.', is_admin: 2 });
  }
  if (action === 'promote_mod') {
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(userId);
    return res.json({ message: 'User promoted to mod.', is_admin: 1 });
  }
  if (action === 'promote_admin') {
    db.prepare('UPDATE users SET is_admin = 3 WHERE id = ?').run(userId);
    return res.json({ message: 'User promoted to admin.', is_admin: 3 });
  }
  if (action === 'demote_admin') {
    db.prepare('UPDATE users SET is_admin = 0 WHERE id = ?').run(userId);
    return res.json({ message: 'User demoted.', is_admin: 0 });
  }

  const canModerate = isOwner || admin.is_admin >= 1;
  if (!canModerate) return res.status(403).json({ error: 'Forbidden' });

  if (action === 'suspend') {
    db.prepare('UPDATE users SET email_verified = 0 WHERE id = ?').run(userId);
    return res.json({ message: 'User suspended.' });
  }
  if (action === 'ban') {
    const ip = target.ip || getClientIP(req);
    db.prepare('UPDATE users SET banned = 1, email_verified = 0 WHERE id = ?').run(userId);
    if (target.ip) {
      db.prepare('UPDATE users SET banned = 1, email_verified = 0 WHERE ip = ? AND id != ?').run(target.ip, userId);
      banIp(target.ip, req.session.user.id);
      blockIPKernel(target.ip).catch(() => {});
    }
    return res.json({ message: 'User and IP banned.', banned: 1 });
  }
  if (action === 'unban') {
    db.prepare('UPDATE users SET banned = 0 WHERE id = ?').run(userId);
    if (target.ip) {
      db.prepare('UPDATE users SET banned = 0 WHERE ip = ?').run(target.ip);
      unbanIp(target.ip);
    }
    return res.json({ message: 'User unbanned.', banned: 0 });
  }
  if (action === 'delete') {
    if (target.ip) unbanIp(target.ip);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    return res.json({ message: 'User deleted.' });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
