import { getLegalDocument } from './documents.js';
import { LEGAL_VERSION, LEGAL_EFFECTIVE } from './version.js';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  <title>${escapeHtml(doc.title)} · PeteZah</title>
  <style>
    :root {
      --bg: #060d16;
      --panel: #0b1522;
      --line: hsla(210, 40%, 80%, 0.12);
      --text: #e8f0fa;
      --muted: hsla(210, 20%, 72%, 0.62);
      --accent: #7eb0ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: radial-gradient(900px 500px at 50% -10%, #12233a 0%, var(--bg) 55%);
      color: var(--text);
      font-family: "Segoe UI", ui-sans-serif, system-ui, -apple-system, sans-serif;
      line-height: 1.55;
    }
    header {
      border-bottom: 1px solid var(--line);
      background: hsla(216, 35%, 8%, 0.85);
      backdrop-filter: blur(10px);
      position: sticky;
      top: 0;
      z-index: 2;
    }
    .bar {
      max-width: 820px;
      margin: 0 auto;
      padding: 14px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .brand {
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 700;
      text-decoration: none;
    }
    nav { display: flex; gap: 14px; flex-wrap: wrap; }
    nav a {
      color: var(--accent);
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
    }
    nav a:hover { text-decoration: underline; }
    main {
      max-width: 820px;
      margin: 0 auto;
      padding: 28px 20px 64px;
    }
    h1 {
      font-size: 1.65rem;
      letter-spacing: -0.03em;
      margin: 0 0 6px;
    }
    .meta {
      color: var(--muted);
      font-size: 0.85rem;
      margin-bottom: 22px;
    }
    article {
      background: linear-gradient(180deg, hsla(216, 35%, 10%, 0.92), hsla(216, 40%, 6%, 0.96));
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 22px 20px;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: inherit;
      font-size: 0.92rem;
      color: hsla(210, 30%, 92%, 0.88);
    }
  </style>
</head>
<body>
  <header>
    <div class="bar">
      <a class="brand" href="/">PeteZah</a>
      <nav>
        <a href="/terms">Terms</a>
        <a href="/privacy-policy">Privacy</a>
        <a href="/dmca">DMCA</a>
      </nav>
    </div>
  </header>
  <main>
    <h1>${escapeHtml(doc.title)}</h1>
    <p class="meta">Effective ${escapeHtml(LEGAL_EFFECTIVE)} · Version ${escapeHtml(LEGAL_VERSION)}</p>
    <article><pre>${bodyHtml}</pre></article>
  </main>
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
