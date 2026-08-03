import express from 'express';
import fetch from 'node-fetch';
import { bumpUsage } from '../utils/usage-daily.js';

const router = express.Router();

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

let cachedClientId = null;
let clientIdFetchedAt = 0;

async function resolveClientId() {
  if (cachedClientId && Date.now() - clientIdFetchedAt < 1000 * 60 * 60 * 6) {
    return cachedClientId;
  }

  const home = await fetch('https://soundcloud.com', {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
  });
  const html = await home.text();
  const scriptUrls = [...html.matchAll(/src="(https:\/\/[a-zA-Z0-9./_-]*sndcdn\.com\/assets\/[a-zA-Z0-9-_.]+\.js)"/g)].map(
    (m) => m[1]
  );

  const candidates = scriptUrls.slice(-8).reverse();
  for (const url of candidates) {
    try {
      const js = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
      const match =
        js.match(/client_id\s*:\s*"([a-zA-Z0-9]{16,})"/) ||
        js.match(/client_id:"([a-zA-Z0-9]{16,})"/) ||
        js.match(/,client_id:"([a-zA-Z0-9]{16,})"/);
      if (match?.[1]) {
        cachedClientId = match[1];
        clientIdFetchedAt = Date.now();
        return cachedClientId;
      }
    } catch {}
  }

  if (cachedClientId) return cachedClientId;
  throw new Error('Could not resolve music client');
}

function mapTrack(t) {
  if (!t || !t.id) return null;
  const artwork =
    t.artwork_url ||
    t.user?.avatar_url ||
    null;
  const followers = Number(t.user?.followers_count || 0);
  const verified = !!(t.user?.verified || t.user?.badges?.verified || t.user?.badges?.pro_unlimited || t.user?.badges?.pro);
  return {
    id: String(t.id),
    title: t.title || 'Untitled',
    artist: t.user?.username || t.user?.full_name || 'Unknown',
    artwork: artwork ? artwork.replace('-large', '-t500x500') : null,
    duration: t.duration || 0,
    permalink_url: t.permalink_url || null,
    genre: t.genre || null,
    streamable: !!t.streamable || t.policy === 'ALLOW' || t.access === 'playable',
    followers,
    verified,
    playbackCount: Number(t.playback_count || 0),
  };
}

const JUNK_TITLE =
  /\b(playlist|mashup|mix|1\s*hour|one\s*hour|kumpulan|lagu|cover|nightcore|sped\s*up|slowed|reverb|bootleg|compilation|mega\s*mix|year\s*mix|tiktok\s*viral|best\s+of|top\s+\d+|mp3|\.mp3|full\s+album)\b/i;
const NON_LATIN_HEAVY = /[\u0400-\u04FF\u0600-\u06FF\u0900-\u097F\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/;

function isQualityTrack(t, { strict = true } = {}) {
  if (!t || !t.id || !t.title) return false;
  if (!t.artwork) return false;
  if (JUNK_TITLE.test(t.title)) return false;
  if (t.title.length > 80) return false;
  if (NON_LATIN_HEAVY.test(t.title) || NON_LATIN_HEAVY.test(t.artist || '')) return false;
  // Prefer real songs: 45s–7.5min
  const dur = Number(t.duration || 0);
  if (dur > 0 && (dur < 45_000 || dur > 450_000)) return false;
  if (strict) {
    if (t.verified) return true;
    if ((t.followers || 0) >= 50_000) return true;
    if ((t.playbackCount || 0) >= 100_000 && (t.followers || 0) >= 5_000) return true;
    return false;
  }
  return (t.followers || 0) >= 2_000 || (t.playbackCount || 0) >= 20_000;
}

function stripMeta(t) {
  if (!t) return null;
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    artwork: t.artwork,
    duration: t.duration,
    permalink_url: t.permalink_url,
    genre: t.genre,
    streamable: t.streamable,
  };
}

async function fetchSearchRaw(clientId, q, limit = 24) {
  try {
    const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${clientId}&limit=${limit}&offset=0`;
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.collection || []).map(mapTrack).filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchUserTracks(clientId, userId, limit = 8) {
  try {
    const url = `https://api-v2.soundcloud.com/users/${userId}/tracks?client_id=${clientId}&limit=${limit}&offset=0`;
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!r.ok) return [];
    const data = await r.json();
    const list = Array.isArray(data) ? data : data.collection || [];
    return list.map(mapTrack).filter(Boolean);
  } catch {
    return [];
  }
}

async function resolveArtistUserId(clientId, name) {
  try {
    const url = `https://api-v2.soundcloud.com/search/users?q=${encodeURIComponent(name)}&client_id=${clientId}&limit=5&offset=0`;
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const users = data.collection || [];
    const want = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    let best = null;
    for (const u of users) {
      const uname = String(u.username || u.full_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const followers = Number(u.followers_count || 0);
      const verified = !!(u.verified || u.badges?.verified || u.badges?.pro_unlimited);
      const exact = uname === want || uname.includes(want) || want.includes(uname);
      if (!exact && followers < 100_000) continue;
      const score = (exact ? 1_000_000 : 0) + (verified ? 500_000 : 0) + followers;
      if (!best || score > best.score) best = { id: u.id, score };
    }
    return best?.id ? String(best.id) : null;
  } catch {
    return null;
  }
}

async function tracksFromArtists(clientId, artists, perArtist = 3, limit = 14) {
  const out = [];
  const seen = new Set();
  for (const name of artists) {
    const uid = await resolveArtistUserId(clientId, name);
    let tracks = [];
    if (uid) tracks = await fetchUserTracks(clientId, uid, perArtist + 2);
    if (!tracks.length) {
      // fallback: search "artist -" style and filter
      tracks = await fetchSearchRaw(clientId, `${name}`, 10);
      tracks = tracks.filter(
        (t) =>
          String(t.artist || '')
            .toLowerCase()
            .includes(name.toLowerCase().split(' ')[0]) || t.verified
      );
    }
    for (const t of tracks) {
      if (!isQualityTrack(t, { strict: false })) continue;
      if (seen.has(t.id)) continue;
      // Prefer tracks that look like they belong to this artist
      const artistMatch = String(t.artist || '')
        .toLowerCase()
        .includes(name.toLowerCase().split(' ')[0].toLowerCase());
      if (!artistMatch && !t.verified && (t.followers || 0) < 80_000) continue;
      seen.add(t.id);
      out.push(t);
      if (out.length >= limit) return out.map(stripMeta);
    }
  }
  return out.map(stripMeta);
}

async function fetchStreamUrl(trackId, clientId) {
  const trackRes = await fetch(`https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${clientId}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!trackRes.ok) throw new Error('Track not found');
  const track = await trackRes.json();

  const transcodings = track?.media?.transcodings || [];
  const progressive = transcodings.find((x) => x.format?.protocol === 'progressive');
  const hls = transcodings.find((x) => x.format?.protocol === 'hls');
  const chosen = progressive || hls;
  if (!chosen?.url) throw new Error('No stream available');

  const streamMeta = await fetch(`${chosen.url}?client_id=${clientId}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!streamMeta.ok) throw new Error('Stream resolve failed');
  const meta = await streamMeta.json();
  if (!meta?.url) throw new Error('No stream url');

  return {
    streamUrl: meta.url,
    protocol: chosen.format?.protocol || 'progressive',
    track: mapTrack(track),
  };
}

router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query' });
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '24'), 10) || 24));

  try {
    const clientId = await resolveClientId();
    const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${clientId}&limit=${limit}&offset=0`;
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!r.ok) return res.status(502).json({ error: 'Search failed' });
    const data = await r.json();
    const tracks = (data.collection || [])
      .map(mapTrack)
      .filter(Boolean)
      .filter((t) => !JUNK_TITLE.test(t.title) && t.title.length <= 100)
      .map(stripMeta);
    res.json({ tracks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/track/:id', async (req, res) => {
  const id = String(req.params.id || '').replace(/[^\d]/g, '');
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    const clientId = await resolveClientId();
    const r = await fetch(`https://api-v2.soundcloud.com/tracks/${id}?client_id=${clientId}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!r.ok) return res.status(404).json({ error: 'Track not found' });
    const track = mapTrack(await r.json());
    res.json({ track });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/stream/:id', async (req, res) => {
  const id = String(req.params.id || '').replace(/[^\d]/g, '');
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    const clientId = await resolveClientId();
    const data = await fetchStreamUrl(id, clientId);
    try { bumpUsage('music', 1); } catch {}
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function fetchChart(clientId, genre, limit = 16) {
  const genrePath = `soundcloud:genres:${genre}`;
  const url = `https://api-v2.soundcloud.com/charts?kind=top&genre=${encodeURIComponent(genrePath)}&client_id=${clientId}&limit=${limit}&offset=0`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.collection || [])
      .map((c) => mapTrack(c.track || c))
      .filter(Boolean)
      .filter((t) => isQualityTrack(t, { strict: false }))
      .map(stripMeta);
  } catch {
    return [];
  }
}

const BROWSE_SHELVES = [
  {
    id: 'top',
    title: 'Top Tracks',
    icon: 'flame',
    artists: ['Drake', 'The Weeknd', 'Taylor Swift', 'Billie Eilish', 'Post Malone', 'Ariana Grande', 'Ed Sheeran', 'Dua Lipa'],
  },
  {
    id: 'pop',
    title: 'Pop Hits',
    icon: 'sparkles',
    artists: ['Olivia Rodrigo', 'Sabrina Carpenter', 'Dua Lipa', 'Harry Styles', 'Charlie Puth', 'Shawn Mendes', 'Doja Cat', 'Lady Gaga'],
  },
  {
    id: 'hiphop',
    title: 'Rap & Hip-Hop',
    icon: 'zap',
    artists: ['Kendrick Lamar', 'Travis Scott', 'J. Cole', 'Eminem', 'Future', 'Lil Baby', 'Nicki Minaj', 'Ice Spice'],
  },
  {
    id: 'chill',
    title: 'Chill & Soft',
    icon: 'radio',
    artists: ['Lauv', 'Joji', 'Clairo', 'Rex Orange County', 'Girl in Red', 'Steve Lacy', 'Tame Impala', 'Khalid'],
  },
  {
    id: 'rnb',
    title: 'R&B Favorites',
    icon: 'heart',
    artists: ['SZA', 'Frank Ocean', 'The Weeknd', 'Brent Faiyaz', 'Summer Walker', 'H.E.R.', 'Daniel Caesar', 'Giveon'],
  },
];

router.get('/trending', async (_req, res) => {
  try {
    const clientId = await resolveClientId();
    let tracks = await tracksFromArtists(
      clientId,
      BROWSE_SHELVES[0].artists,
      3,
      20
    );
    if (!tracks.length) {
      const raw = await fetchSearchRaw(clientId, 'Drake', 30);
      tracks = raw.filter((t) => isQualityTrack(t, { strict: true })).slice(0, 16).map(stripMeta);
    }
    res.json({ tracks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/browse', async (_req, res) => {
  try {
    const clientId = await resolveClientId();
    const results = await Promise.all(
      BROWSE_SHELVES.map(async (s) => ({
        id: s.id,
        title: s.title,
        icon: s.icon,
        tracks: await tracksFromArtists(clientId, s.artists, 3, 14),
      }))
    );
    let out = results.filter((s) => s.tracks.length > 0);
    if (!out.length) {
      const fallback = await tracksFromArtists(
        clientId,
        ['Drake', 'The Weeknd', 'Taylor Swift', 'Billie Eilish', 'SZA'],
        4,
        16
      );
      if (fallback.length) {
        out = [{ id: 'top', title: 'Top Tracks', icon: 'flame', tracks: fallback }];
      }
    }
    res.json({ sections: out });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/home', async (_req, res) => {
  // Kept for compatibility; homepage no longer surfaces music.
  res.json({ tracks: [], artists: [] });
});

export default router;
