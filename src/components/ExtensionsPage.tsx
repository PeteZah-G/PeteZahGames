import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Puzzle, Plus, Trash2, X, Edit2, Check, AlertTriangle, Globe, Code, Power } from "lucide-react";
import { requestSyncSoon } from "@/lib/settingsSync";

export interface Extension {
  id: string;
  name: string;
  urlPattern: string;
  code: string;
  enabled: boolean;
  createdAt: number;
}



export function getExtensions(): Extension[] {
  try { return JSON.parse(localStorage.getItem("petezah-extensions") || "[]"); } catch { return []; }
}
export function saveExtensions(exts: Extension[]) {
  try { localStorage.setItem("petezah-extensions", JSON.stringify(exts)); requestSyncSoon(); } catch {}
}

export function urlMatchesPattern(url: string, pattern: string): boolean {
  if (!pattern || !url) return false;
  try {
    let raw = url.trim();
    if (raw.startsWith("petezah://")) return false;
    if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const fullPath = parsed.pathname + parsed.search;

    let pat = pattern.trim();
    if (pat === "*" || pat === "*://*/*") return true;
    pat = pat.replace(/^[a-z]+:\/\//i, "").replace(/^www\./i, "");

    let hostPat = pat;
    let pathPat = "/*";
    const slashIdx = pat.indexOf("/");
    if (slashIdx >= 0) {
      hostPat = pat.slice(0, slashIdx) || "*";
      pathPat = pat.slice(slashIdx) || "/*";
    }

    hostPat = hostPat.toLowerCase();
    if (hostPat.startsWith("*.")) {
      const domain = hostPat.slice(2);
      if (!(host === domain || host.endsWith("." + domain))) return false;
    } else if (hostPat.includes("*")) {
      const re = new RegExp(
        "^" + hostPat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*") + "$",
        "i"
      );
      if (!re.test(host)) return false;
    } else if (host !== hostPat) {
      return false;
    }

    if (!pathPat || pathPat === "/*" || pathPat === "*" || pathPat === "/") return true;
    const pathRe = new RegExp(
      "^" + pathPat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*"),
      "i"
    );
    return pathRe.test(fullPath);
  } catch {
    return false;
  }
}

export function runExtensionsOnFrame(iframe: HTMLIFrameElement | null | undefined, pageUrl: string) {
  if (!iframe || !pageUrl || pageUrl.startsWith("petezah://")) return;
  const matches = getExtensions().filter((e) => e.enabled && e.code && urlMatchesPattern(pageUrl, e.urlPattern));
  if (!matches.length) return;
  try {
    const doc = iframe.contentDocument;
    if (!doc?.documentElement) return;
    const ran = (iframe as any).__pzExtRan as Set<string> | undefined;
    const set: Set<string> = ran || new Set();
    (iframe as any).__pzExtRan = set;
    const urlKey = pageUrl.split("#")[0];
    for (const ext of matches) {
      const stamp = `${ext.id}::${urlKey}`;
      if (set.has(stamp)) continue;
      if (!isSafeCode(ext.code).safe) continue;
      const script = doc.createElement("script");
      script.setAttribute("data-pz-ext", ext.id);
      script.textContent = `(function(){try{\n${ext.code}\n}catch(err){console.error("[PeteZah extension]",err);}})();`;
      (doc.head || doc.documentElement).appendChild(script);
      set.add(stamp);
    }
  } catch {}
}

const BLOCKED_PATTERNS = [
  /document\.cookie/i, /localStorage\.(setItem|removeItem|clear)/i,
  /fetch\s*\(/i, /XMLHttpRequest/i, /eval\s*\(/i,
  /window\.location\s*=/i, /document\.write\s*\(/i,
  /\.innerHTML\s*=/i, /\.outerHTML\s*=/i,
  /import\s*\(/i, /require\s*\(/i,
  /new\s+Function/i, /setTimeout.*Function/i,
];

function isSafeCode(code: string): { safe: boolean; reason?: string } {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      return { safe: false, reason: `Blocked pattern: ${pattern.source.split("/i")[0]}` };
    }
  }
  return { safe: true };
}

const S = {
  surface: "hsl(216 26% 9%)",
  elevated: "hsl(216 22% 12%)",
  border: "hsl(216 20% 16%)",
  borderFocus: "hsl(213 60% 40%)",
  accent: "hsl(213 70% 58%)",
  accentDim: "hsl(213 50% 40% / 0.3)",
  text: "hsl(0 0% 96%)",
  textSub: "hsl(216 15% 45%)",
  textMuted: "hsl(216 12% 28%)",
  danger: "hsl(0 60% 56%)",
  success: "hsl(145 50% 50%)",
  warn: "hsl(38 80% 56%)",
};

interface ExtModalProps {
  ext: Partial<Extension> | null;
  onSave: (e: Extension) => void;
  onClose: () => void;
}

function ExtModal({ ext, onSave, onClose }: ExtModalProps) {
  const [name, setName] = useState(ext?.name || "");
  const [urlPattern, setUrlPattern] = useState(ext?.urlPattern || "");
  const [code, setCode] = useState(ext?.code || "");
  const [safetyErr, setSafetyErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setCode(ev.target?.result as string);
    reader.readAsText(file);
  };

  const handleSave = () => {
    if (!name.trim() || !urlPattern.trim() || !code.trim()) return;
    const check = isSafeCode(code);
    if (!check.safe) { setSafetyErr(check.reason || "Unsafe code detected"); return; }
    setSafetyErr("");
    onSave({
      id: ext?.id || String(Date.now()),
      name: name.trim(),
      urlPattern: urlPattern.trim(),
      code: code.trim(),
      enabled: ext?.enabled ?? true,
      createdAt: ext?.createdAt || Date.now(),
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "hsl(216 32% 4% / 0.7)", backdropFilter: "blur(8px)" }}
    >
      <div style={{ position: "absolute", inset: 0 }} onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
        style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: 480, background: S.surface, border: `1px solid ${S.border}`, borderRadius: 14, padding: 24, boxShadow: "0 24px 48px hsl(216 50% 3% / 0.6)" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: S.text, margin: 0 }}>{ext?.id ? "Edit Extension" : "New Extension"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: S.textMuted, display: "flex" }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: S.textMuted, marginBottom: 5 }}>Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="My Extension"
              style={{ width: "100%", background: S.elevated, border: `1px solid ${S.border}`, borderRadius: 8, color: S.text, fontSize: 12, padding: "8px 11px", outline: "none", fontFamily: "inherit", boxSizing: "border-box", transition: "border-color 0.15s" }}
              onFocus={e => (e.currentTarget.style.borderColor = S.borderFocus)}
              onBlur={e => (e.currentTarget.style.borderColor = S.border)} />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: S.textMuted, marginBottom: 5 }}>URL Pattern</label>
            <input value={urlPattern} onChange={e => setUrlPattern(e.target.value)} placeholder="e.g. google.com or *.reddit.com or *"
              style={{ width: "100%", background: S.elevated, border: `1px solid ${S.border}`, borderRadius: 8, color: S.text, fontSize: 12, padding: "8px 11px", outline: "none", fontFamily: "inherit", boxSizing: "border-box", transition: "border-color 0.15s" }}
              onFocus={e => (e.currentTarget.style.borderColor = S.borderFocus)}
              onBlur={e => (e.currentTarget.style.borderColor = S.border)} />
            <p style={{ fontSize: 10, color: S.textMuted, margin: "4px 0 0" }}>Use <code style={{ color: S.accent }}>*</code> for all sites, <code style={{ color: S.accent }}>*.domain.com</code> for subdomains</p>
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
              <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: S.textMuted }}>JavaScript Code</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input ref={fileRef} type="file" accept=".js,.txt" onChange={handleFile} style={{ display: "none" }} />
                <button onClick={() => fileRef.current?.click()} style={{ fontSize: 10, color: S.accent, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                  <Plus size={9} /> Upload .js
                </button>
              </div>
            </div>
            <textarea value={code} onChange={e => { setCode(e.target.value); setSafetyErr(""); }} placeholder={"// Runs when the URL matches\n// Use document, window, etc.\nconsole.log('Hello from extension!');"}
              rows={8} style={{ width: "100%", background: S.elevated, border: `1px solid ${safetyErr ? S.danger : S.border}`, borderRadius: 8, color: S.text, fontSize: 11, padding: "9px 11px", outline: "none", resize: "vertical", fontFamily: "monospace", boxSizing: "border-box", transition: "border-color 0.15s" }}
              onFocus={e => (e.currentTarget.style.borderColor = safetyErr ? S.danger : S.borderFocus)}
              onBlur={e => (e.currentTarget.style.borderColor = safetyErr ? S.danger : S.border)} />
            {safetyErr && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, padding: "6px 10px", background: "hsl(0 60% 50% / 0.08)", border: "1px solid hsl(0 60% 50% / 0.2)", borderRadius: 7, color: S.danger, fontSize: 11 }}>
                <AlertTriangle size={11} style={{ flexShrink: 0 }} /> {safetyErr}
              </div>
            )}
            <div style={{ marginTop: 8, padding: "8px 10px", background: S.elevated, border: `1px solid ${S.border}`, borderRadius: 7 }}>
              <p style={{ fontSize: 10, color: S.textMuted, margin: 0, lineHeight: 1.5 }}>
                <span style={{ color: S.warn }}>⚠ Restrictions:</span> No fetch, cookie access, localStorage writes, eval, innerHTML, or dynamic imports. Code runs in the page context via a script tag.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={handleSave} style={{ flex: 1, padding: "9px 16px", borderRadius: 8, background: S.accentDim, border: `1px solid ${S.borderFocus}`, color: S.accent, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Save Extension
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function ExtensionsPage({ onNavigate }: { onNavigate: (url: string) => void }) {
  const [extensions, setExtensions] = useState<Extension[]>(getExtensions);
  const [editing, setEditing] = useState<Partial<Extension> | null | "new">(null);

  function save(ext: Extension) {
    const updated = extensions.some(e => e.id === ext.id)
      ? extensions.map(e => e.id === ext.id ? ext : e)
      : [...extensions, ext];
    setExtensions(updated);
    saveExtensions(updated);
    setEditing(null);
  }

  function remove(id: string) {
    const updated = extensions.filter(e => e.id !== id);
    setExtensions(updated);
    saveExtensions(updated);
  }

  function toggle(id: string) {
    const updated = extensions.map(e => e.id === id ? { ...e, enabled: !e.enabled } : e);
    setExtensions(updated);
    saveExtensions(updated);
  }

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "transparent" }}>
      <div style={{ position: "relative", zIndex: 10, height: "100%", display: "flex", flexDirection: "column" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "28px 32px 16px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "hsl(213 50% 40% / 0.25)", border: `1px solid hsl(213 60% 40% / 0.35)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Puzzle size={16} style={{ color: S.accent }} />
            </div>
            <div>
              <h1 style={{ fontSize: 17, fontWeight: 700, color: S.text, margin: 0 }}>Extensions</h1>
              <p style={{ fontSize: 11, color: S.textSub, margin: 0 }}>{extensions.filter(e => e.enabled).length} active · {extensions.length} total</p>
            </div>
          </div>
          <button
            onClick={() => setEditing("new")}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", background: S.accentDim, border: `1px solid ${S.borderFocus}`, borderRadius: 8, color: S.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={e => (e.currentTarget.style.background = "hsl(213 50% 40% / 0.45)")}
            onMouseLeave={e => (e.currentTarget.style.background = S.accentDim)}
          >
            <Plus size={13} /> New Extension
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 32px 32px", scrollbarWidth: "thin", scrollbarColor: `${S.border} transparent` }}>
          {extensions.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60%", gap: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: S.surface, border: `1px solid ${S.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Puzzle size={22} style={{ color: S.textMuted }} />
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: S.text, margin: "0 0 4px" }}>No extensions yet</p>
                <p style={{ fontSize: 12, color: S.textSub, margin: 0 }}>Add JavaScript that runs on matching pages</p>
              </div>
              <button
                onClick={() => setEditing("new")}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", background: S.accentDim, border: `1px solid ${S.borderFocus}`, borderRadius: 9, color: S.accent, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                <Plus size={13} /> Add your first extension
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 640 }}>
              {extensions.map(ext => (
                <motion.div
                  key={ext.id}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px", background: S.surface, border: `1px solid ${ext.enabled ? S.border : "hsl(216 20% 12%)"}`, borderRadius: 10, opacity: ext.enabled ? 1 : 0.55, transition: "all 0.15s" }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: ext.enabled ? S.accentDim : S.elevated, border: `1px solid ${ext.enabled ? S.borderFocus : S.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Code size={13} style={{ color: ext.enabled ? S.accent : S.textMuted }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{ext.name}</span>
                      {ext.enabled && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "hsl(145 50% 42% / 0.12)", color: S.success, border: "1px solid hsl(145 50% 42% / 0.25)" }}>Active</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                      <Globe size={9} style={{ color: S.textMuted }} />
                      <span style={{ fontSize: 10, color: S.textSub, fontFamily: "monospace" }}>{ext.urlPattern}</span>
                    </div>
                    <p style={{ fontSize: 10, color: S.textMuted, margin: 0, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ext.code.split("\n")[0].slice(0, 60)}{ext.code.length > 60 ? "…" : ""}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button onClick={() => toggle(ext.id)} title={ext.enabled ? "Disable" : "Enable"} style={{ width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: S.elevated, border: `1px solid ${S.border}`, cursor: "pointer", color: ext.enabled ? S.success : S.textMuted, transition: "all 0.15s" }}>
                      <Power size={11} />
                    </button>
                    <button onClick={() => setEditing(ext)} title="Edit" style={{ width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: S.elevated, border: `1px solid ${S.border}`, cursor: "pointer", color: S.textMuted, transition: "color 0.15s" }}
                      onMouseEnter={e => (e.currentTarget.style.color = S.accent)} onMouseLeave={e => (e.currentTarget.style.color = S.textMuted)}>
                      <Edit2 size={11} />
                    </button>
                    <button onClick={() => remove(ext.id)} title="Delete" style={{ width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: S.elevated, border: `1px solid ${S.border}`, cursor: "pointer", color: S.textMuted, transition: "color 0.15s" }}
                      onMouseEnter={e => (e.currentTarget.style.color = S.danger)} onMouseLeave={e => (e.currentTarget.style.color = S.textMuted)}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {editing && (
          <ExtModal
            ext={editing === "new" ? null : editing}
            onSave={save}
            onClose={() => setEditing(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}