export function isBookmarklet(url: string | null | undefined): boolean {
  return /^\s*javascript:/i.test(String(url || ""));
}

export function normalizeBookmarklet(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if (/^\s*javascript:/i.test(trimmed)) return trimmed;
  if (/^\s*\(/.test(trimmed) || /^\s*void\s*\(/i.test(trimmed) || /^\s*function\b/i.test(trimmed)) {
    return `javascript:${trimmed}`;
  }
  return trimmed;
}

export function extractBookmarkletCode(raw: string): string {
  let s = String(raw || "").trim();
  if (!s) return "";
  s = s.replace(/^\s*javascript:\s*/i, "");
  try {
    if (/%[0-9A-Fa-f]{2}/.test(s)) {
      s = decodeURIComponent(s);
    }
  } catch {}
  return s.trim();
}

export function runBookmarkletOnFrame(
  iframe: HTMLIFrameElement | null | undefined,
  raw: string
): { ok: true } | { ok: false; reason: string } {
  const code = extractBookmarkletCode(raw);
  if (!code) return { ok: false, reason: "Empty bookmarklet" };
  if (!iframe) return { ok: false, reason: "Open a website tab first" };

  try {
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    if (!win || !doc?.documentElement) {
      return { ok: false, reason: "Page is not ready yet" };
    }

    const script = doc.createElement("script");
    script.setAttribute("data-pz-bookmarklet", "1");
    script.textContent = `(function(){try{\n${code}\n}catch(err){console.error("[PeteZah bookmarklet]",err);}})();`;
    (doc.head || doc.documentElement).appendChild(script);
    try {
      script.remove();
    } catch {}
    return { ok: true };
  } catch {
    return { ok: false, reason: "Could not run on this page" };
  }
}
