export const PX = {
  prefix: '/afsd123k2/',
  core: '/q9vx/',
  mux: '/m4thx/',
  epoxy: '/e7px/',
  curl: '/l9cx/',
  stream: '/n/s/',
  edge: '/api/edge/',
  sw: '/1k123.js',
  blocked: [
    '/scram/',
    '/scramjet/',
    '/static/scram-embed.html',
    '/baremux/',
    '/bare-mux/',
    '/epoxy/',
    '/libcurl/',
    '/ws-stream/',
    '/bare/',
    '/ultraviolet/',
    '/uv/',
    '/petezah/',
    '/static/uv/',
    '/modules/',
    '/kernel/',
    '/res/',
    '/transport/',
    '/calc/',
    '/assets/bundle.js',
    '/assets/handler.js',
    '/assets/client.js',
    '/assets/worker.js',
    '/assets/internal-worker.js',
    '/assets/config.js',
  ],
};

export function isStreamUpgrade(url) {
  const path = String(url || '').split('?')[0];
  if (path.startsWith('/api/websocket/normal')) return false;
  if (path.startsWith('/api/websocket/tor')) return false;
  if (path.startsWith(PX.stream)) return true;
  if (path.startsWith('/api/websocket/')) return true;
  if (path.startsWith('/api/websocket-tor/')) return true;
  if (path.startsWith('/api/websocket-premium/')) return true;
  if (/^\/api\/websocket-\d+\//.test(path)) return true;
  if (path.startsWith('/wisp/') || path.startsWith('/ws-stream/')) return true;
  if (/^\/api\/(?:wisp-premium|alt-wisp-\d+|wisp-tor)\//.test(path)) return true;
  if (/^\/api\/(?:stream-premium|alt-stream-\d+)\//.test(path)) return true;
  return false;
}

export function toWispLibUrl(url) {
  const raw = String(url || '');
  const q = raw.indexOf('?');
  const path = q === -1 ? raw : raw.slice(0, q);
  const qs = q === -1 ? '' : raw.slice(q);
  if (path.startsWith('/wisp/')) return raw;
  const stripped = path
    .replace(/^\/n\/s\//, '')
    .replace(/^\/api\/websocket-tor\//, '')
    .replace(/^\/api\/websocket-premium\//, '')
    .replace(/^\/api\/websocket-\d+\//, '')
    .replace(/^\/api\/websocket\//, '')
    .replace(/^\/ws-stream\//, '')
    .replace(/^\/api\/(?:wisp-premium|alt-wisp-\d+|wisp-tor)\//, '')
    .replace(/^\/api\/(?:stream-premium|alt-stream-\d+)\//, '');
  return '/wisp/' + stripped.replace(/^\/+/, '') + qs;
}
