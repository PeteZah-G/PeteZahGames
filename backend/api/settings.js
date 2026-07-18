import db from '../db.js';

export async function getSettingsHandler(req, res) {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.session.user.id);
  res.json({ settings: settings || null });
}

export async function saveSettingsHandler(req, res) {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const { localstorage_data, theme } = req.body;
  if (localstorage_data && typeof localstorage_data !== 'string') return res.status(400).json({ error: 'Invalid data' });
  if (localstorage_data && localstorage_data.length > 200000) return res.status(400).json({ error: 'Settings data too large' });
  const now = Date.now();
  const existing = db.prepare('SELECT user_id FROM user_settings WHERE user_id = ?').get(req.session.user.id);
  if (existing) {
    db.prepare('UPDATE user_settings SET localstorage_data = ?, theme = ?, updated_at = ? WHERE user_id = ?').run(
      localstorage_data || null,
      theme || 'dark',
      now,
      req.session.user.id
    );
  } else {
    db.prepare('INSERT INTO user_settings (user_id, localstorage_data, theme, updated_at) VALUES (?, ?, ?, ?)').run(
      req.session.user.id,
      localstorage_data || null,
      theme || 'dark',
      now
    );
  }
  res.json({ message: 'Settings saved' });
}