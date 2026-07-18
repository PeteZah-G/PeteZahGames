import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const EMBED_PROVIDERS = [
  {
    id: 'vidsrc',
    label: 'VidSrc',
    movie: (id) => `https://vidsrc.xyz/embed/movie/${id}`,
    tv: (id, s, e) => `https://vidsrc.xyz/embed/tv/${id}/${s}-${e}`,
  },
  {
    id: 'vidsrc2',
    label: 'VidSrc CC',
    movie: (id) => `https://vidsrc.cc/v2/embed/movie/${id}`,
    tv: (id, s, e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: 'embedsu',
    label: 'EmbedSU',
    movie: (id) => `https://embed.su/embed/movie/${id}`,
    tv: (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: 'superembed',
    label: 'SuperEmbed',
    movie: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1`,
    tv: (id, s, e) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`,
  },
  {
    id: 'vidlink',
    label: 'VidLink',
    movie: (id) => `https://vidlink.pro/movie/${id}`,
    tv: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}`,
  },
  {
    id: 'moviesapi',
    label: 'MoviesAPI',
    movie: (id) => `https://moviesapi.club/movie/${id}`,
    tv: (id, s, e) => `https://moviesapi.club/tv/${id}-${s}-${e}`,
  },
];

function absUrl(base, rel) {
  try {
    return new URL(rel, base).href;
  } catch {
    return rel;
  }
}

function proxyUrl(target) {
  return `/api/video/asset?u=${encodeURIComponent(target)}`;
}

function rewriteCss(css, base) {
  return css.replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi, (full, q, raw) => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return full;
    return `url(${q || ''}${proxyUrl(absUrl(base, trimmed))}${q || ''})`;
  });
}

function rewriteHtml(html, base) {
  let out = html;
  out = out.replace(/(<(?:script|img|iframe|source|video|audio|link|embed)\b[^>]*?\b(?:src|href)=["'])([^"']+)(["'])/gi, (full, pre, url, post) => {
    if (!url || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('javascript:')) return full;
    if (url.startsWith('/api/video/')) return full;
    return `${pre}${proxyUrl(absUrl(base, url))}${post}`;
  });
  out = out.replace(/(<(?:a|form)\b[^>]*?\b(?:href|action)=["'])(https?:\/\/[^"']+)(["'])/gi, (full, pre, url, post) => {
    return `${pre}${proxyUrl(url)}${post}`;
  });
  out = out.replace(/url\(\s*(['"]?)(https?:\/\/[^)'"]+)\1\s*\)/gi, (full, q, url) => {
    return `url(${q || ''}${proxyUrl(url)}${q || ''})`;
  });
  out = out.replace(/<\/head>/i, `<base href="${base}">\n<script>window.open=function(){return null};</script>\n</head>`);
  return out;
}

function rewriteM3u8(text, base) {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        if (trimmed.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${proxyUrl(absUrl(base, u))}"`);
        }
        return line;
      }
      return proxyUrl(absUrl(base, trimmed));
    })
    .join('\n');
}

function resolveEmbedUrl(providerId, type, id, season, episode) {
  const provider = EMBED_PROVIDERS.find((p) => p.id === providerId) || EMBED_PROVIDERS[0];
  if (type === 'tv') return provider.tv(id, season || 1, episode || 1);
  return provider.movie(id);
}

router.get('/providers', (_req, res) => {
  res.json({
    providers: EMBED_PROVIDERS.map((p) => ({ id: p.id, label: p.label })),
  });
});

router.get('/watch', (req, res) => {
  const type = req.query.type === 'tv' ? 'tv' : 'movie';
  const id = String(req.query.id || '').replace(/[^\d]/g, '');
  const season = Math.max(1, parseInt(String(req.query.season || '1'), 10) || 1);
  const episode = Math.max(1, parseInt(String(req.query.episode || '1'), 10) || 1);
  const provider = String(req.query.provider || 'vidsrc');
  if (!id) return res.status(400).json({ error: 'Missing id' });

  const target = resolveEmbedUrl(provider, type, id, season, episode);
  const frameSrc = `/api/video/frame?u=${encodeURIComponent(target)}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
html,body{margin:0;padding:0;width:100%;height:100%;background:#000;overflow:hidden}
iframe{border:0;width:100%;height:100%;display:block;background:#000}
</style>
</head>
<body>
<iframe src="${frameSrc}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>
</body>
</html>`);
});

router.get('/frame', async (req, res) => {
  const target = String(req.query.u || '');
  if (!/^https?:\/\//i.test(target)) return res.status(400).send('Invalid URL');

  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: new URL(target).origin + '/',
      },
      redirect: 'follow',
    });

    const finalUrl = upstream.url || target;
    const contentType = upstream.headers.get('content-type') || '';
    if (!upstream.ok) {
      return res.status(upstream.status).send(`Upstream error ${upstream.status}`);
    }

    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      const html = await upstream.text();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(rewriteHtml(html, finalUrl));
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (contentType) res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.send(buf);
  } catch (e) {
    res.status(502).send(`Proxy error: ${e.message}`);
  }
});

router.get('/asset', async (req, res) => {
  const target = String(req.query.u || '');
  if (!/^https?:\/\//i.test(target)) return res.status(400).send('Invalid URL');

  try {
    const headers = {
      'User-Agent': UA,
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: new URL(target).origin + '/',
      Origin: new URL(target).origin,
    };
    if (req.headers.range) headers.Range = req.headers.range;

    const upstream = await fetch(target, { headers, redirect: 'follow' });
    const finalUrl = upstream.url || target;
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';

    if (!upstream.ok && upstream.status !== 206) {
      return res.status(upstream.status).send(`Upstream ${upstream.status}`);
    }

    const isM3u8 =
      contentType.includes('mpegurl') ||
      contentType.includes('m3u8') ||
      /\.m3u8(\?|$)/i.test(finalUrl);

    if (isM3u8) {
      const text = await upstream.text();
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(rewriteM3u8(text, finalUrl));
    }

    const isCss = contentType.includes('text/css') || /\.css(\?|$)/i.test(finalUrl);
    if (isCss) {
      const text = await upstream.text();
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=600');
      return res.send(rewriteCss(text, finalUrl));
    }

    const isHtml = contentType.includes('text/html');
    if (isHtml) {
      const text = await upstream.text();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(rewriteHtml(text, finalUrl));
    }

    if (contentType) res.setHeader('Content-Type', contentType);
    const len = upstream.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);
    const cr = upstream.headers.get('content-range');
    if (cr) res.setHeader('Content-Range', cr);
    const ar = upstream.headers.get('accept-ranges');
    if (ar) res.setHeader('Accept-Ranges', ar);
    res.status(upstream.status);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=120');

    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.send(buf);
  } catch (e) {
    res.status(502).send(`Asset proxy error: ${e.message}`);
  }
});

router.get('/embed-url', (req, res) => {
  const type = req.query.type === 'tv' ? 'tv' : 'movie';
  const id = String(req.query.id || '').replace(/[^\d]/g, '');
  const season = Math.max(1, parseInt(String(req.query.season || '1'), 10) || 1);
  const episode = Math.max(1, parseInt(String(req.query.episode || '1'), 10) || 1);
  const provider = String(req.query.provider || 'vidsrc');
  if (!id) return res.status(400).json({ error: 'Missing id' });

  const watch = `/api/video/watch?type=${type}&id=${id}&provider=${encodeURIComponent(provider)}${
    type === 'tv' ? `&season=${season}&episode=${episode}` : ''
  }`;
  res.json({ url: watch, provider });
});

export default router;
