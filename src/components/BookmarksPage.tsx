import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bookmark, Plus, Trash2, X, Edit2, FolderOpen, Folder, Link, Image, ChevronDown, ChevronRight, Globe, Check } from "lucide-react";
import { requestSyncSoon } from "@/lib/settingsSync";

export interface BookmarkItem {
  id: string;
  title: string;
  url: string;
  favicon: string;
  cover?: string;
  groupId: string | null;
  createdAt: number;
}

export interface BookmarkGroup {
  id: string;
  name: string;
  collapsed: boolean;
  createdAt: number;
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

function getBookmarks(): { items: BookmarkItem[]; groups: BookmarkGroup[] } {
  try {
    const raw = localStorage.getItem("petezah-bookmarks");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { items: [], groups: [] };
}
function saveBookmarks(data: { items: BookmarkItem[]; groups: BookmarkGroup[] }) {
  try { localStorage.setItem("petezah-bookmarks", JSON.stringify(data)); requestSyncSoon(); } catch {}
}

export function addBookmark(url: string, title: string) {
  const data = getBookmarks();
  if (data.items.some(b => b.url === url)) return;
  data.items.push({
    id: String(Date.now()),
    title: title || url,
    url,
    favicon: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url)}&sz=32`,
    groupId: null,
    createdAt: Date.now(),
  });
  saveBookmarks(data);
}

const S = {
  bg: "hsl(216 32% 6%)",
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
};

interface BookmarkModalProps {
  item: Partial<BookmarkItem> | null;
  groups: BookmarkGroup[];
  onSave: (item: BookmarkItem) => void;
  onClose: () => void;
}

function BookmarkModal({ item, groups, onSave, onClose }: BookmarkModalProps) {
  const [title, setTitle] = useState(item?.title || "");
  const [url, setUrl] = useState(item?.url || "");
  const [cover, setCover] = useState(item?.cover || "");
  const [groupId, setGroupId] = useState<string | null>(item?.groupId ?? null);
  const coverRef = useRef<HTMLInputElement>(null);

  const handleCoverFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setCover(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!title.trim() || !url.trim()) return;
    const cleanUrl = url.trim().startsWith("http") ? url.trim() : "https://" + url.trim();
    onSave({
      id: item?.id || String(Date.now()),
      title: title.trim(),
      url: cleanUrl,
      favicon: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(cleanUrl)}&sz=32`,
      cover: cover || undefined,
      groupId,
      createdAt: item?.createdAt || Date.now(),
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
        style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: 380, background: S.surface, border: `1px solid ${S.border}`, borderRadius: 14, padding: 22, boxShadow: "0 24px 48px hsl(216 50% 3% / 0.6)" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: S.text, margin: 0 }}>{item?.id ? "Edit Bookmark" : "Add Bookmark"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: S.textMuted, display: "flex" }}><X size={14} /></button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {[
            { label: "Title", value: title, set: setTitle, placeholder: "Page title" },
            { label: "URL", value: url, set: setUrl, placeholder: "https://..." },
          ].map(({ label, value, set, placeholder }) => (
            <div key={label}>
              <label style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: S.textMuted, marginBottom: 5 }}>{label}</label>
              <input value={value} onChange={e => set(e.target.value)} placeholder={placeholder}
                style={{ width: "100%", background: S.elevated, border: `1px solid ${S.border}`, borderRadius: 8, color: S.text, fontSize: 12, padding: "8px 11px", outline: "none", fontFamily: "inherit", boxSizing: "border-box", transition: "border-color 0.15s" }}
                onFocus={e => (e.currentTarget.style.borderColor = S.borderFocus)}
                onBlur={e => (e.currentTarget.style.borderColor = S.border)} />
            </div>
          ))}

          <div>
            <label style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: S.textMuted, marginBottom: 5 }}>Group</label>
            <select value={groupId || ""} onChange={e => setGroupId(e.target.value || null)}
              style={{ width: "100%", background: S.elevated, border: `1px solid ${S.border}`, borderRadius: 8, color: S.text, fontSize: 12, padding: "8px 11px", outline: "none", fontFamily: "inherit", cursor: "pointer" }}>
              <option value="">No group</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: S.textMuted, marginBottom: 5 }}>Cover Image</label>
            <input ref={coverRef} type="file" accept="image/*" onChange={handleCoverFile} style={{ display: "none" }} />
            <button onClick={() => coverRef.current?.click()}
              style={{ width: "100%", padding: "8px 11px", background: S.elevated, border: `1px solid ${S.border}`, borderRadius: 8, color: cover ? S.accent : S.textSub, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, transition: "border-color 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = S.borderFocus)}
              onBlur={e => (e.currentTarget.style.borderColor = S.border)}>
              <Image size={11} />
              {cover ? "Cover selected" : "Upload cover image"}
              {cover && <button onClick={e => { e.stopPropagation(); setCover(""); }} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: S.textMuted, display: "flex", padding: 0 }}><X size={10} /></button>}
            </button>
            {cover && <img src={cover} style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 7, marginTop: 6, border: `1px solid ${S.border}` }} alt="" />}
          </div>

          <button onClick={handleSave} style={{ padding: "9px 16px", borderRadius: 8, background: S.accentDim, border: `1px solid ${S.borderFocus}`, color: S.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", marginTop: 2 }}>
            Save Bookmark
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

interface GroupModalProps {
  group: Partial<BookmarkGroup> | null;
  onSave: (g: BookmarkGroup) => void;
  onClose: () => void;
}
function GroupModal({ group, onSave, onClose }: GroupModalProps) {
  const [name, setName] = useState(group?.name || "");
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "hsl(216 32% 4% / 0.7)", backdropFilter: "blur(8px)" }}
    >
      <div style={{ position: "absolute", inset: 0 }} onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
        style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: 320, background: S.surface, border: `1px solid ${S.border}`, borderRadius: 14, padding: 22, boxShadow: "0 24px 48px hsl(216 50% 3% / 0.6)" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: S.text, margin: 0 }}>{group?.id ? "Rename Group" : "New Group"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: S.textMuted, display: "flex" }}><X size={14} /></button>
        </div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Group name"
          autoFocus
          onKeyDown={e => { if (e.key === "Enter" && name.trim()) onSave({ id: group?.id || String(Date.now()), name: name.trim(), collapsed: false, createdAt: group?.createdAt || Date.now() }); }}
          style={{ width: "100%", background: S.elevated, border: `1px solid ${S.borderFocus}`, borderRadius: 8, color: S.text, fontSize: 13, padding: "9px 11px", outline: "none", fontFamily: "inherit", boxSizing: "border-box", marginBottom: 12 }} />
        <button
          onClick={() => { if (name.trim()) onSave({ id: group?.id || String(Date.now()), name: name.trim(), collapsed: false, createdAt: group?.createdAt || Date.now() }); }}
          style={{ width: "100%", padding: "9px", borderRadius: 8, background: S.accentDim, border: `1px solid ${S.borderFocus}`, color: S.accent, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          Save
        </button>
      </motion.div>
    </motion.div>
  );
}

export default function BookmarksPage({ onNavigate }: { onNavigate: (url: string) => void }) {
  const [data, setData] = useState(getBookmarks);
  const [editingItem, setEditingItem] = useState<Partial<BookmarkItem> | null | "new">(null);
  const [editingGroup, setEditingGroup] = useState<Partial<BookmarkGroup> | null | "new">(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const { items, groups } = data;

  function persistData(next: { items: BookmarkItem[]; groups: BookmarkGroup[] }) {
    setData(next); saveBookmarks(next);
  }

  function saveItem(item: BookmarkItem) {
    const exists = items.some(i => i.id === item.id);
    persistData({ ...data, items: exists ? items.map(i => i.id === item.id ? item : i) : [...items, item] });
    setEditingItem(null);
  }

  function removeItem(id: string) {
    persistData({ ...data, items: items.filter(i => i.id !== id) });
  }

  function saveGroup(group: BookmarkGroup) {
    const exists = groups.some(g => g.id === group.id);
    persistData({ ...data, groups: exists ? groups.map(g => g.id === group.id ? group : g) : [...groups, group] });
    setEditingGroup(null);
  }

  function removeGroup(id: string) {
    persistData({ items: items.map(i => i.groupId === id ? { ...i, groupId: null } : i), groups: groups.filter(g => g.id !== id) });
  }

  function toggleGroup(id: string) {
    setCollapsedGroups(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const ungrouped = items.filter(i => !i.groupId);
  const total = items.length;

  function BookmarkCard({ item }: { item: BookmarkItem }) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        style={{ position: "relative", background: S.surface, border: `1px solid ${S.border}`, borderRadius: 10, overflow: "hidden", cursor: "pointer", transition: "border-color 0.15s" }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = S.borderFocus)}
        onMouseLeave={e => (e.currentTarget.style.borderColor = S.border)}
      >
        {item.cover && (
          <div style={{ height: 72, overflow: "hidden" }}>
            <img src={item.cover} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
          </div>
        )}
        <div style={{ padding: "10px 12px" }} onClick={() => onNavigate(item.url)}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
            <div style={{ width: 18, height: 18, borderRadius: 5, background: S.elevated, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
              {item.favicon ? <img src={item.favicon} style={{ width: 11, height: 11 }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} alt="" /> : <Globe size={9} style={{ color: S.textMuted }} />}
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: S.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
          </div>
          <p style={{ fontSize: 10, color: S.textMuted, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.url.replace(/^https?:\/\/(www\.)?/, "")}
          </p>
        </div>
        <div style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 3 }}>
          <button onClick={e => { e.stopPropagation(); setEditingItem(item); }}
            style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "hsl(216 32% 6% / 0.8)", border: `1px solid ${S.border}`, cursor: "pointer", color: S.textMuted, backdropFilter: "blur(4px)" }}
            onMouseEnter={e => (e.currentTarget.style.color = S.accent)} onMouseLeave={e => (e.currentTarget.style.color = S.textMuted)}>
            <Edit2 size={9} />
          </button>
          <button onClick={e => { e.stopPropagation(); removeItem(item.id); }}
            style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "hsl(216 32% 6% / 0.8)", border: `1px solid ${S.border}`, cursor: "pointer", color: S.textMuted, backdropFilter: "blur(4px)" }}
            onMouseEnter={e => (e.currentTarget.style.color = S.danger)} onMouseLeave={e => (e.currentTarget.style.color = S.textMuted)}>
            <X size={9} />
          </button>
        </div>
      </motion.div>
    );
  }

  function BookmarkGrid({ items }: { items: BookmarkItem[] }) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
        {items.map(item => <BookmarkCard key={item.id} item={item} />)}
        <motion.div
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          onClick={() => setEditingItem("new")}
          style={{ background: "transparent", border: `1px dashed ${S.border}`, borderRadius: 10, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "20px 12px", transition: "border-color 0.15s", minHeight: 72 }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = S.borderFocus)}
          onMouseLeave={e => (e.currentTarget.style.borderColor = S.border)}
        >
          <Plus size={16} style={{ color: S.textMuted }} />
          <span style={{ fontSize: 11, color: S.textMuted }}>Add bookmark</span>
        </motion.div>
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: S.bg }}>
      <FluidCanvas />
      <div style={{ position: "relative", zIndex: 10, height: "100%", display: "flex", flexDirection: "column" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "28px 32px 16px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "hsl(213 50% 40% / 0.25)", border: `1px solid hsl(213 60% 40% / 0.35)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Bookmark size={16} style={{ color: S.accent }} />
            </div>
            <div>
              <h1 style={{ fontSize: 17, fontWeight: 700, color: S.text, margin: 0 }}>Bookmarks</h1>
              <p style={{ fontSize: 11, color: S.textSub, margin: 0 }}>{total} saved · {groups.length} groups</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setEditingGroup("new")}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 13px", background: S.surface, border: `1px solid ${S.border}`, borderRadius: 8, color: S.textSub, fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = S.borderFocus; e.currentTarget.style.color = S.text; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = S.border; e.currentTarget.style.color = S.textSub; }}
            >
              <FolderOpen size={12} /> New Group
            </button>
            <button
              onClick={() => setEditingItem("new")}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", background: S.accentDim, border: `1px solid ${S.borderFocus}`, borderRadius: 8, color: S.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "hsl(213 50% 40% / 0.45)")}
              onMouseLeave={e => (e.currentTarget.style.background = S.accentDim)}
            >
              <Plus size={13} /> Add Bookmark
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 32px 32px", scrollbarWidth: "thin", scrollbarColor: `${S.border} transparent` }}>
          {total === 0 && groups.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60%", gap: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: S.surface, border: `1px solid ${S.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Bookmark size={22} style={{ color: S.textMuted }} />
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: S.text, margin: "0 0 4px" }}>No bookmarks yet</p>
                <p style={{ fontSize: 12, color: S.textSub, margin: 0 }}>Save sites and organize them into groups</p>
              </div>
              <button
                onClick={() => setEditingItem("new")}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", background: S.accentDim, border: `1px solid ${S.borderFocus}`, borderRadius: 9, color: S.accent, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                <Plus size={13} /> Add your first bookmark
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 800 }}>
              {groups.map(group => {
                const groupItems = items.filter(i => i.groupId === group.id);
                const isCollapsed = collapsedGroups.has(group.id);
                return (
                  <div key={group.id}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <button onClick={() => toggleGroup(group.id)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: S.textSub, padding: 0 }}>
                        {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                        {isCollapsed ? <Folder size={13} /> : <FolderOpen size={13} />}
                        <span style={{ fontSize: 12, fontWeight: 600, color: S.text }}>{group.name}</span>
                        <span style={{ fontSize: 10, color: S.textMuted }}>({groupItems.length})</span>
                      </button>
                      <div style={{ flex: 1 }} />
                      <button onClick={() => setEditingGroup(group)} style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: S.textMuted }}
                        onMouseEnter={e => (e.currentTarget.style.color = S.accent)} onMouseLeave={e => (e.currentTarget.style.color = S.textMuted)}>
                        <Edit2 size={10} />
                      </button>
                      <button onClick={() => removeGroup(group.id)} style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: S.textMuted }}
                        onMouseEnter={e => (e.currentTarget.style.color = S.danger)} onMouseLeave={e => (e.currentTarget.style.color = S.textMuted)}>
                        <Trash2 size={10} />
                      </button>
                    </div>
                    <AnimatePresence>
                      {!isCollapsed && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                          <BookmarkGrid items={groupItems} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}

              {ungrouped.length > 0 || groups.length === 0 ? (
                <div>
                  {groups.length > 0 && (
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: S.textMuted, margin: "0 0 10px" }}>Unsorted</p>
                  )}
                  <BookmarkGrid items={ungrouped} />
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                  <motion.div
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={() => setEditingItem("new")}
                    style={{ background: "transparent", border: `1px dashed ${S.border}`, borderRadius: 10, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "20px 12px", minHeight: 72 }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = S.borderFocus)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = S.border)}
                  >
                    <Plus size={16} style={{ color: S.textMuted }} />
                    <span style={{ fontSize: 11, color: S.textMuted }}>Add bookmark</span>
                  </motion.div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {editingItem && <BookmarkModal item={editingItem === "new" ? null : editingItem} groups={groups} onSave={saveItem} onClose={() => setEditingItem(null)} />}
        {editingGroup && <GroupModal group={editingGroup === "new" ? null : editingGroup} onSave={saveGroup} onClose={() => setEditingGroup(null)} />}
      </AnimatePresence>
    </div>
  );
}