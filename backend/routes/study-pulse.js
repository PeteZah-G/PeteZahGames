import { Router } from 'express';

const router = Router();

const SUBJECTS = ['Algebra', 'Biology', 'Literature', 'Geometry', 'Chemistry', 'History'];
const TOPICS = ['Linear equations', 'Cell structure', 'Poetry analysis', 'Triangles', 'Acids and bases', 'World War II'];

function pick(list, seed) {
  return list[Math.abs(seed) % list.length];
}

function seedFrom(req) {
  const ip = String(req.ip || req.socket?.remoteAddress || '0');
  const day = new Date().toISOString().slice(0, 10);
  let h = 0;
  const s = `${ip}:${day}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

router.get('/session', (req, res) => {
  const seed = seedFrom(req);
  res.setHeader('Cache-Control', 'private, max-age=45');
  res.json({
    streak: (Math.abs(seed) % 7) + 1,
    minutes: (Math.abs(seed >> 3) % 40) + 5,
    subject: pick(SUBJECTS, seed),
    focus: pick(TOPICS, seed >> 5),
  });
});

router.get('/stats', (req, res) => {
  const seed = seedFrom(req);
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.json({
    due: (Math.abs(seed >> 2) % 12) + 1,
    mastered: (Math.abs(seed >> 4) % 120) + 20,
    reviewedToday: (Math.abs(seed >> 6) % 25) + 3,
  });
});

router.get('/progress', (req, res) => {
  const seed = seedFrom(req);
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.json({
    completed: (Math.abs(seed >> 1) % 5) + 1,
    score: (Math.abs(seed >> 3) % 25) + 70,
    nextTopic: pick(TOPICS, seed >> 7),
  });
});

export default router;
