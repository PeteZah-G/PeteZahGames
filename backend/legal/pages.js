import { getLegalDocument } from './documents.js';
import { LEGAL_VERSION, LEGAL_EFFECTIVE } from './version.js';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pageIcon(kind) {
  if (kind === 'privacy') {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
  }
  if (kind === 'dmca') {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M14.83 14.83a4 4 0 1 1 0-5.66"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
  }
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
}

export function renderLegalHtml(kind) {
  const doc = getLegalDocument(kind);
  if (!doc) return null;
  const bodyHtml = escapeHtml(doc.body);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="index, follow" />
  <meta name="theme-color" content="#020810" />
  <title>${escapeHtml(doc.title)} · PeteZah</title>
  <style>
    :root {
      --bg0: #020810;
      --line: hsla(210, 40%, 80%, 0.12);
      --text: #e8f0fa;
      --muted: hsla(210, 18%, 70%, 0.58);
      --faint: hsla(210, 14%, 60%, 0.42);
      --accent: #4d8dff;
      --accent-soft: hsla(213, 70%, 55%, 0.16);
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      min-height: 100%;
      background: var(--bg0);
      color: var(--text);
      font-family: "Segoe UI", ui-sans-serif, system-ui, -apple-system, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    #vanta-bg {
      position: fixed;
      inset: 0;
      z-index: 0;
      width: 100vw;
      height: 100dvh;
      background: #020810;
      pointer-events: none;
      overflow: hidden;
    }
    #vanta-bg canvas {
      display: block !important;
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      max-width: none !important;
      max-height: none !important;
    }
    .space-twinkle {
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      opacity: 0.42;
      mix-blend-mode: screen;
      background-image:
        radial-gradient(1.2px 1.2px at 6% 12%, rgba(255,255,255,0.55), transparent),
        radial-gradient(1px 1px at 14% 38%, rgba(160,210,255,0.45), transparent),
        radial-gradient(1.4px 1.4px at 22% 18%, rgba(255,255,255,0.6), transparent),
        radial-gradient(1px 1px at 80% 48%, rgba(255,255,255,0.28), transparent),
        radial-gradient(1px 1px at 94% 18%, rgba(255,255,255,0.25), transparent);
    }
    .top-nav {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 10px 20px;
      background: hsla(216, 30%, 7%, 0.88);
      backdrop-filter: blur(16px) saturate(140%);
      -webkit-backdrop-filter: blur(16px) saturate(140%);
      border-bottom: 1px solid var(--line);
    }
    .nav-left {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .pz-exit {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 12px;
      border-radius: 9px;
      border: 1px solid var(--line);
      background: var(--accent-soft);
      color: #9ec5ff;
      font-size: 12px;
      font-weight: 650;
      text-decoration: none;
      white-space: nowrap;
    }
    .pz-exit:hover { filter: brightness(1.1); }
    .nav-brand img {
      display: block;
      height: 28px;
      width: auto;
      border-radius: 7px;
    }
    .nav-brand-label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--text);
      font-size: 15px;
      font-weight: 800;
      letter-spacing: -0.02em;
      text-decoration: none;
    }
    .labs-badge {
      padding: 2px 7px;
      border-radius: 6px;
      background: hsla(213, 50%, 45%, 0.2);
      border: 1px solid hsla(213, 40%, 50%, 0.25);
      color: #9ec5ff;
      font-size: 10px;
      font-weight: 650;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .nav-links {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }
    .nav-link {
      color: var(--muted);
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
    }
    .nav-link:hover { color: var(--text); }
    .nav-link.active { color: #9ec5ff; }
    .stage {
      position: relative;
      z-index: 1;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 88px 20px 48px;
    }
    .panel {
      width: 100%;
      max-width: 640px;
      max-height: calc(100dvh - 136px);
      display: flex;
      flex-direction: column;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: hsla(216, 28%, 9%, 0.96);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
      overflow: hidden;
    }
    .panel-head {
      padding: 22px 22px 16px;
      border-bottom: 1px solid var(--line);
      text-align: center;
      flex-shrink: 0;
    }
    .logo-tile {
      width: 56px;
      height: 56px;
      margin: 0 auto 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(160deg, hsla(216, 28%, 14%, 0.95), hsla(216, 32%, 9%, 0.98));
      border: 1px solid var(--line);
      border-radius: 16px;
      color: #9ec5ff;
    }
    .eyebrow {
      font-size: 10px;
      font-weight: 650;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 8px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: clamp(1.25rem, 3vw, 1.45rem);
      font-weight: 750;
      letter-spacing: -0.03em;
    }
    .meta {
      margin: 0;
      color: var(--faint);
      font-size: 12px;
    }
    .panel-body {
      padding: 18px 22px 24px;
      overflow-y: auto;
      flex: 1;
      min-height: 0;
      text-align: left;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: inherit;
      font-size: 0.88rem;
      line-height: 1.55;
      color: hsla(210, 30%, 88%, 0.88);
    }
    @media (max-width: 640px) {
      .nav-brand-label { display: none; }
      .panel { max-height: none; }
      .stage { align-items: flex-start; padding-top: 76px; }
    }
  </style>
</head>
<body>
  <div id="vanta-bg" aria-hidden="true"></div>
  <div class="space-twinkle" aria-hidden="true"></div>
  <header class="top-nav">
    <div class="nav-left">
      <a class="pz-exit" href="/">← Exit to PeteZah</a>
      <a class="nav-brand" href="/" aria-label="PeteZah">
        <img src="/logo.png" alt="PeteZah" height="28" onerror="this.style.display='none'" />
      </a>
      <a class="nav-brand-label" href="/">
        PeteZah <span class="labs-badge">Legal</span>
      </a>
    </div>
    <nav class="nav-links">
      <a class="nav-link${kind === 'terms' ? ' active' : ''}" href="/terms">Terms</a>
      <a class="nav-link${kind === 'privacy' ? ' active' : ''}" href="/privacy-policy">Privacy</a>
      <a class="nav-link${kind === 'dmca' ? ' active' : ''}" href="/dmca">DMCA</a>
    </nav>
  </header>
  <main class="stage">
    <article class="panel">
      <div class="panel-head">
        <div class="logo-tile">${pageIcon(kind)}</div>
        <p class="eyebrow">PeteZah Legal</p>
        <h1>${escapeHtml(doc.title)}</h1>
        <p class="meta">Effective ${escapeHtml(LEGAL_EFFECTIVE)} · Version ${escapeHtml(LEGAL_VERSION)}</p>
      </div>
      <div class="panel-body"><pre>${bodyHtml}</pre></div>
    </article>
  </main>
  <script type="module" src="/pz-vanta.js"><\/script>
</body>
</html>`;
}

export function sendLegalPage(kind) {
  return (_req, res) => {
    const html = renderLegalHtml(kind);
    if (!html) return res.status(404).end();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(html);
  };
}

export function redirectLegal(to) {
  return (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.redirect(301, to);
  };
}
