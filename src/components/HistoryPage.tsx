import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { History, Search, Trash2, X, Clock, ExternalLink, ChevronDown, Globe } from "lucide-react";

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  favicon: string;
  visitedAt: number;
  isProxied: boolean;
}

function FluidCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const animRef = useRef<number>(0);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const parent = canvas.parentElement;
      const w = parent ? parent.clientWidth : canvas.offsetWidth;
      const h = parent ? parent.clientHeight : canvas.offsetHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);
    const blobs = Array.from({ length: 6 }, (_, i) => ({
      x: Math.random() * (canvas.offsetWidth || 800),
      y: Math.random() * (canvas.offsetHeight || 600),
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      radius: 140 + Math.random() * 200,
      hue: 200 + i * 10,
      saturation: 60 + Math.random() * 25,
      lightness: 40 + Math.random() * 15,
      opacity: 0.15 + Math.random() * 0.12,
    }));
    let time = 0;
    const animate = () => {
      time += 0.003;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);
      blobs.forEach((b) => {
        b.x += b.vx + Math.sin(time + b.hue) * 0.15;
        b.y += b.vy + Math.cos(time * 0.7 + b.hue) * 0.15;
        const dx = mouseRef.current.x - b.x;
        const dy = mouseRef.current.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 300) { b.x += dx * 0.003; b.y += dy * 0.003; }
        if (b.x < -b.radius) b.x = w + b.radius;
        if (b.x > w + b.radius) b.x = -b.radius;
        if (b.y < -b.radius) b.y = h + b.radius;
        if (b.y > h + b.radius) b.y = -b.radius;
        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius);
        grad.addColorStop(0, `hsla(${b.hue},${b.saturation}%,${b.lightness}%,${b.opacity * 2.2})`);
        grad.addColorStop(0.4, `hsla(${b.hue},${b.saturation}%,${b.lightness}%,${b.opacity * 1.1})`);
        grad.addColorStop(1, `hsla(${b.hue},${b.saturation}%,${b.lightness}%,0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      });
      for (let i = 0; i < 3; i++) {
        const wx = w * (0.2 + i * 0.3) + Math.sin(time * 0.5 + i) * 60;
        const wy = h * (0.3 + i * 0.2) + Math.cos(time * 0.4 + i * 2) * 40;
        const wg = ctx.createRadialGradient(wx, wy, 0, wx, wy, 120);
        wg.addColorStop(0, "hsla(210,70%,90%,0.07)");
        wg.addColorStop(1, "hsla(210,60%,90%,0)");
        ctx.fillStyle = wg;
        ctx.fillRect(0, 0, w, h);
      }
      animRef.current = requestAnimationFrame(animate);
    };
    animate();
    const handleMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    canvas.addEventListener("mousemove", handleMouse);
    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", handleMouse);
      cancelAnimationFrame(animRef.current);
    };
  }, []);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}

export function getHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem("petezah-history") || "[]"); } catch { return []; }
}
export function saveHistory(entries: HistoryEntry[]) {
  try { localStorage.setItem("petezah-history", JSON.stringify(entries)); } catch {}
}
export function recordHistory(url: string, title: string, isProxied: boolean) {
  if (!url || url.startsWith("petezah://") || url === "about:blank" || url === "https://") return;
  const entries = getHistory();
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url)}&sz=32`;
  const newEntry: HistoryEntry = {
    id: String(Date.now()) + Math.random(),
    url,
    title: title || url,
    favicon,
    visitedAt: Date.now(),
    isProxied,
  };
  const filtered = entries.filter(e => e.url !== url);
  saveHistory([newEntry, ...filtered].slice(0, 500));
}

function groupByDate(entries: HistoryEntry[]) {
  const groups: Record<string, HistoryEntry[]> = {};
  entries.forEach(e => {
    const d = new Date(e.visitedAt);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    let label: string;
    if (d.toDateString() === today.toDateString()) label = "Today";
    else if (d.toDateString() === yesterday.toDateString()) label = "Yesterday";
    else label = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    if (!groups[label]) groups[label] = [];
    groups[label].push(e);
  });
  return groups;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function getDomain(url: string) {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
}

const S = {
  bg: "hsl(216 32% 6%)",
  surface: "hsl(216 26% 9%)",
  elevated: "hsl(216 22% 12%)",
  border: "hsl(216 20% 16%)",
  accent: "hsl(213 70% 58%)",
  text: "hsl(0 0% 96%)",
  textSub: "hsl(216 15% 45%)",
  textMuted: "hsl(216 12% 28%)",
  danger: "hsl(0 60% 56%)",
};

export default function HistoryPage({ onNavigate }: { onNavigate: (url: string) => void }) {
  const [entries, setEntries] = useState<HistoryEntry[]>(getHistory);
  const [search, setSearch] = useState("");
  const [showClearMenu, setShowClearMenu] = useState(false);
  const clearRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clearRef.current && !clearRef.current.contains(e.target as Node)) setShowClearMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = entries.filter(e =>
    e.url.toLowerCase().includes(search.toLowerCase()) ||
    e.title.toLowerCase().includes(search.toLowerCase())
  );
  const grouped = groupByDate(filtered);
  const uniqueDomains = [...new Set(entries.map(e => getDomain(e.url)))];

  function removeEntry(id: string) {
    const updated = entries.filter(e => e.id !== id);
    setEntries(updated); saveHistory(updated);
  }
  function clearAll() {
    setEntries([]); saveHistory([]); setShowClearMenu(false);
  }
  function clearSite(domain: string) {
    const updated = entries.filter(e => getDomain(e.url) !== domain);
    setEntries(updated); saveHistory(updated); setShowClearMenu(false);
  }
  function clearSiteData(domain: string) {
    clearSite(domain);
    try {
      Object.keys(localStorage).filter(k => k.includes(domain)).forEach(k => localStorage.removeItem(k));
    } catch {}
  }

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: S.bg }}>
      <FluidCanvas />
      <div style={{ position: "relative", zIndex: 10, height: "100%", display: "flex", flexDirection: "column" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "28px 32px 16px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "hsl(213 50% 40% / 0.25)", border: `1px solid hsl(213 60% 40% / 0.35)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <History size={16} style={{ color: S.accent }} />
            </div>
            <div>
              <h1 style={{ fontSize: 17, fontWeight: 700, color: S.text, margin: 0 }}>History</h1>
              <p style={{ fontSize: 11, color: S.textSub, margin: 0 }}>{entries.length} visits recorded</p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: S.surface, border: `1px solid ${S.border}`, borderRadius: 8, width: 220 }}>
              <Search size={12} style={{ color: S.textMuted, flexShrink: 0 }} />
              <input
                value={search} onChange={e => setSearch(e.target.value)} placeholder="Search history..."
                style={{ background: "transparent", border: "none", outline: "none", color: S.text, fontSize: 12, width: "100%", fontFamily: "inherit" }}
              />
              {search && (
                <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: S.textMuted, display: "flex", padding: 0 }}>
                  <X size={10} />
                </button>
              )}
            </div>

            <div style={{ position: "relative" }} ref={clearRef}>
              <button
                onClick={() => setShowClearMenu(v => !v)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: S.surface, border: `1px solid ${S.border}`, borderRadius: 8, color: S.danger, fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "border-color 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "hsl(0 60% 50% / 0.4)")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = S.border)}
              >
                <Trash2 size={11} /> Clear <ChevronDown size={9} />
              </button>
              <AnimatePresence>
                {showClearMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.12 }}
                    style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50, background: S.surface, border: `1px solid ${S.border}`, borderRadius: 10, padding: "6px 0", minWidth: 220, boxShadow: "0 16px 32px hsl(216 50% 4% / 0.6)" }}
                  >
                    <button
                      onClick={clearAll}
                      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", color: S.danger, fontSize: 12, textAlign: "left" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "hsl(0 60% 50% / 0.08)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "none")}
                    >
                      <Trash2 size={11} /> Clear all history
                    </button>
                    {uniqueDomains.length > 0 && (
                      <>
                        <div style={{ height: 1, background: S.border, margin: "4px 0" }} />
                        <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: S.textMuted, padding: "4px 14px 2px", margin: 0 }}>By site</p>
                        {uniqueDomains.slice(0, 8).map(domain => (
                          <div key={domain} style={{ display: "flex", alignItems: "center" }}>
                            <button
                              onClick={() => clearSite(domain)}
                              style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", background: "none", border: "none", cursor: "pointer", color: "hsl(0 0% 80%)", fontSize: 11, textAlign: "left" }}
                              onMouseEnter={e => (e.currentTarget.style.background = S.elevated)}
                              onMouseLeave={e => (e.currentTarget.style.background = "none")}
                            >
                              <Globe size={10} style={{ flexShrink: 0, color: S.textMuted }} />
                              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{domain}</span>
                            </button>
                            <button
                              onClick={() => clearSiteData(domain)} title="Clear site + local data"
                              style={{ padding: "6px 10px", background: "none", border: "none", cursor: "pointer", color: S.textMuted, fontSize: 9, flexShrink: 0 }}
                              onMouseEnter={e => (e.currentTarget.style.color = S.danger)}
                              onMouseLeave={e => (e.currentTarget.style.color = S.textMuted)}
                            >
                              +data
                            </button>
                          </div>
                        ))}
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 32px 32px", scrollbarWidth: "thin", scrollbarColor: `${S.border} transparent` }}>
          {Object.keys(grouped).length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60%", gap: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: S.surface, border: `1px solid ${S.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <History size={20} style={{ color: S.textMuted }} />
              </div>
              <p style={{ fontSize: 13, color: S.textSub, margin: 0 }}>{search ? "No results found" : "No history yet"}</p>
            </div>
          ) : (
            Object.entries(grouped).map(([date, items]) => (
              <div key={date} style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: S.textMuted, margin: "0 0 6px" }}>{date}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <AnimatePresence>
                    {items.map(entry => (
                      <motion.div
                        key={entry.id}
                        initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6, height: 0 }} transition={{ duration: 0.12 }}
                        className="history-row"
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 7, border: "1px solid transparent", transition: "all 0.12s" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = S.surface; (e.currentTarget as HTMLElement).style.borderColor = S.border; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.borderColor = "transparent"; }}
                      >
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: S.elevated, border: `1px solid ${S.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                          {entry.favicon ? (
                            <img src={entry.favicon} style={{ width: 13, height: 13 }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} alt="" />
                          ) : (
                            <Globe size={9} style={{ color: S.textMuted }} />
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => onNavigate(entry.url)}>
                          <p style={{ fontSize: 12, fontWeight: 500, color: "hsl(0 0% 88%)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.title}</p>
                          <p style={{ fontSize: 10, color: S.textMuted, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getDomain(entry.url)}</p>
                        </div>
                        <span style={{ fontSize: 10, color: S.textMuted, flexShrink: 0 }}>{formatTime(entry.visitedAt)}</span>
                        <button onClick={() => onNavigate(entry.url)} title="Visit" style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: S.textMuted, flexShrink: 0 }}
                          onMouseEnter={e => (e.currentTarget.style.color = S.accent)} onMouseLeave={e => (e.currentTarget.style.color = S.textMuted)}>
                          <ExternalLink size={10} />
                        </button>
                        <button onClick={() => removeEntry(entry.id)} title="Remove" style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: S.textMuted, flexShrink: 0 }}
                          onMouseEnter={e => (e.currentTarget.style.color = S.danger)} onMouseLeave={e => (e.currentTarget.style.color = S.textMuted)}>
                          <X size={10} />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}