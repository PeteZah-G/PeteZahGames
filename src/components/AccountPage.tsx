import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Settings, LogOut, Eye, EyeOff, Check, AlertCircle, Loader2,
  Zap, ChevronRight, Lock, Mail, KeyRound, Download, Upload, Trash2,
  Megaphone, MessageSquare, Palette, Shield, Sliders, Camera,
  UserCog, Users, Ban, UserMinus, ShieldCheck, ShieldOff, Plus, ExternalLink, Image, Pipette,
  Music2, MapPin, Link2, Heart, Globe2, Radio, Monitor, BarChart3, Copy,
} from "lucide-react";
import {
  reconcileSettings,
  pushSettings,
  pullSettings,
  schedulePushSettings,
} from "@/lib/settingsSync";
import { notifyAuthChanged } from "@/hooks/useAuth";
import { consumePendingAuth } from "@/lib/authPending";
import { applyVpnRegion } from "@/lib/vpn";

interface AuthUser {
  id: string; email: string; username?: string; bio?: string;
  display_name?: string; status?: string; location?: string; website?: string;
  profile_color?: string; banner_url?: string | null;
  favorite_music?: FavTrack[]; profile_public?: boolean; show_activity?: boolean;
  avatar_url?: string; is_admin?: number; is_owner?: boolean; created_at?: number;
  email_verified?: boolean | number; totp_enabled?: boolean | number;
}
interface FavTrack {
  id: string; title: string; artist: string; artwork: string | null;
  duration?: number; permalink_url?: string | null;
}
interface AdminUser {
  id: string; username?: string; is_admin?: number;
  email_verified?: number; banned?: number; created_at?: number; is_owner?: boolean;
}
interface StaffMember extends AdminUser {
  ip?: string;
}
interface AdminUserDetail extends AdminUser {
  email: string; avatar_url?: string; bio?: string; ip?: string; school?: string; age?: number;
}

const THEMES = [
  { id: "default",         label: "Deep Space", color: "#020810" },
  { id: "swampy-green",    label: "Forest",     color: "#060d09" },
  { id: "royal-purple",    label: "Royal",      color: "#08060e" },
  { id: "blood-red",       label: "Crimson",    color: "#0a0405" },
  { id: "midnight-forest", label: "Midnight",   color: "#050908" },
  { id: "cyber-neon",      label: "Cyber",      color: "#05050d" },
  { id: "desert-oasis",    label: "Desert",     color: "#0a0904" },
  { id: "glacial-frost",   label: "Frost",      color: "#050810" },
];

const SITE_PRESETS = [
  { id: "classroom", label: "Google Classroom", favicon: "https://ssl.gstatic.com/classroom/favicon.ico" },
  { id: "schoology",  label: "Schoology",        favicon: "https://asset-cdn.schoology.com/sites/all/themes/schoology_theme/favicon.ico" },
  { id: "google",    label: "Google",            favicon: "https://www.google.com/favicon.ico" },
  { id: "petezah",   label: "PeteZah",           favicon: "/logo.png" },
];

type Section = "profile" | "get-links" | "appearance" | "cloaking" | "behavior" | "data" | "admin" | "live" | "firefox-vm" | "link-stats" | "updates";

const THEME_COLORS: Record<string, { bgColor: string; textColor: string }> = {
  "default":         { bgColor: "#020810", textColor: "#e8f0fa" },
  "swampy-green":    { bgColor: "#060d09", textColor: "#cde8d0" },
  "royal-purple":    { bgColor: "#08060e", textColor: "#ddd0f5" },
  "blood-red":       { bgColor: "#0a0405", textColor: "#f5cdd0" },
  "midnight-forest": { bgColor: "#050908", textColor: "#c8ddd4" },
  "cyber-neon":      { bgColor: "#05050d", textColor: "#d0d0ff" },
  "desert-oasis":    { bgColor: "#0a0904", textColor: "#f0e0c0" },
  "glacial-frost":   { bgColor: "#050810", textColor: "#c8e0f0" },
};

function applySettingsNow(s: Record<string, string>) {
  if (s.theme) {
    document.body.className = document.body.className.replace(/theme-[\w-]+/g, "").trim();
    document.body.classList.add(`theme-${s.theme}`);
    const tc = THEME_COLORS[s.theme];
    if (tc && !s.backgroundColor && !s.backgroundImage) {
      document.body.style.color = tc.textColor;
    }
  }
  const bgImg = s.backgroundImage ?? localStorage.getItem("backgroundImage");
  const bgColor = s.backgroundColor ?? localStorage.getItem("backgroundColor");
  if (bgImg) {
    document.body.style.backgroundImage = `url(${bgImg})`;
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundRepeat = "no-repeat";
    document.body.style.backgroundPosition = "center";
    document.body.style.backgroundColor = "";
  } else {
    document.body.style.backgroundImage = "none";
    if (bgColor) document.body.style.backgroundColor = bgColor;
  }
  if (s.siteTitle) document.title = s.siteTitle;
  if (s.siteLogo) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
    link.href = s.siteLogo;
  }
  const prevRC = (window as any).__rightClickHandler;
  if (prevRC) document.removeEventListener("contextmenu", prevRC);
  if (s.disableRightClick === "true") {
    const h = (e: MouseEvent) => e.preventDefault();
    (window as any).__rightClickHandler = h;
    document.addEventListener("contextmenu", h);
  }
  const prevUL = (window as any).__beforeUnloadHandler;
  if (prevUL) window.removeEventListener("beforeunload", prevUL);
  if (s.beforeUnload === "true") {
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    (window as any).__beforeUnloadHandler = h;
    window.addEventListener("beforeunload", h);
  }
  const prevPanic = (window as any).__panicKeyHandler;
  if (prevPanic) window.removeEventListener("keydown", prevPanic);
  if (s.panicKey && s.panicUrl) {
    const h = (e: KeyboardEvent) => { if (e.key === s.panicKey) window.location.href = s.panicUrl; };
    (window as any).__panicKeyHandler = h;
    window.addEventListener("keydown", h);
  }
  if (s.disableParticles === "true") {
    document.querySelectorAll(".particles, .particle, canvas[data-particles]").forEach(el => el.parentNode?.removeChild(el));
  }
  if (s.theme && !s.backgroundColor && !s.backgroundImage) {
    const tc = THEME_COLORS[s.theme];
    if (tc) {
      localStorage.setItem("backgroundColor", tc.bgColor);
      document.body.style.backgroundColor = tc.bgColor;
      document.body.style.backgroundImage = "none";
      document.body.style.color = tc.textColor;
    }
  }
  if (!s.backgroundImage) {
    localStorage.removeItem("backgroundImage");
  } else {
    localStorage.setItem("backgroundImage", s.backgroundImage);
  }
  Object.entries(s).forEach(([k, v]) => {
    if (k === "backgroundImage") return;
    if (v === "" || v === undefined || v === null) {
      if (k === "backgroundColor") return;
      localStorage.removeItem(k);
      return;
    }
    localStorage.setItem(k, v);
  });
  if (s.bgNetwork !== undefined) {
    localStorage.setItem("bgNetwork", s.bgNetwork === "true" ? "true" : "false");
  }
  localStorage.setItem("settingsUpdated", Date.now().toString());
  window.dispatchEvent(new CustomEvent("petezah-settings-updated"));
}

function FluidCanvas({ enabled }: { enabled: boolean }) {
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

        if (enabled) {
          const dx = mouseRef.current.x - b.x;
          const dy = mouseRef.current.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 300) {
            b.x += dx * 0.003;
            b.y += dy * 0.003;
          }
        }

        if (b.x < -b.radius) b.x = w + b.radius;
        if (b.x > w + b.radius) b.x = -b.radius;
        if (b.y < -b.radius) b.y = h + b.radius;
        if (b.y > h + b.radius) b.y = -b.radius;

        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius);
        grad.addColorStop(0, `hsla(${b.hue}, ${b.saturation}%, ${b.lightness}%, ${b.opacity * 2.2})`);
        grad.addColorStop(0.4, `hsla(${b.hue}, ${b.saturation}%, ${b.lightness}%, ${b.opacity * 1.1})`);
        grad.addColorStop(1, `hsla(${b.hue}, ${b.saturation}%, ${b.lightness}%, 0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      });

      for (let i = 0; i < 3; i++) {
        const wx = w * (0.2 + i * 0.3) + Math.sin(time * 0.5 + i) * 60;
        const wy = h * (0.3 + i * 0.2) + Math.cos(time * 0.4 + i * 2) * 40;
        const wg = ctx.createRadialGradient(wx, wy, 0, wx, wy, 120);
        wg.addColorStop(0, "hsla(210, 70%, 90%, 0.07)");
        wg.addColorStop(1, "hsla(210, 60%, 90%, 0)");
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
  }, [enabled]);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}

function HypeAd() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    // Set options before script loads
    (window as any).atOptions = {
      key: "5aed292251276d82b269fc3b8ecc354d",
      format: "iframe",
      height: 90,
      width: 728,
      params: {},
    };

    const script = document.createElement("script");
    script.src = "https://www.highperformanceformat.com/5aed292251276d82b269fc3b8ecc354d/invoke.js";
    script.async = true;
    container.appendChild(script);

    return () => {
      if (container.contains(script)) container.removeChild(script);
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{ display: "flex", justifyContent: "center", width: "100%", minHeight: 90 }}
    />
  );
}

const C = {
  bg:       "hsl(216 32% 6%)",
  surface:  "hsl(216 26% 9%)",
  elevated: "hsl(216 22% 12%)",
  border:   "hsl(216 20% 16%)",
  borderFocus: "hsl(213 60% 40%)",
  accent:   "hsl(213 70% 58%)",
  accentDim:"hsl(213 50% 40%)",
  text:     "hsl(0 0% 96%)",
  textSub:  "hsl(216 15% 58%)",
  textMuted:"hsl(216 12% 32%)",
  danger:   "hsl(0 60% 56%)",
  success:  "hsl(145 50% 50%)",
};

function Field({ label, type = "text", value, onChange, placeholder, icon: Icon, maxLength, readOnly }: any) {
  const [focused, setFocused] = useState(false);
  const [show, setShow] = useState(false);
  const isPass = type === "password";
  return (
    <div>
      {label && <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px", color: C.textMuted }}>{label}</label>}
      <div style={{
        position: "relative", display: "flex", alignItems: "center",
        background: C.surface,
        border: `1px solid ${focused ? C.borderFocus : C.border}`,
        borderRadius: "8px", transition: "border-color 0.15s",
      }}>
        {Icon && <Icon size={12} style={{ position: "absolute", left: "12px", color: C.textMuted, flexShrink: 0 }} />}
        <input
          type={isPass && show ? "text" : type}
          value={value} onChange={onChange} placeholder={placeholder}
          maxLength={maxLength} readOnly={readOnly}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{
            width: "100%", background: "transparent", outline: "none",
            color: C.text, fontSize: "13px",
            padding: `9px ${isPass ? "36px" : "12px"} 9px ${Icon ? "34px" : "12px"}`,
            fontFamily: "inherit",
          }}
        />
        {isPass && (
          <button type="button" onClick={() => setShow(!show)} style={{ position: "absolute", right: "12px", color: C.textMuted, background: "none", border: "none", cursor: "pointer" }}>
            {show ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        )}
      </div>
    </div>
  );
}

function Toggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0", gap: "16px" }}>
      <div>
        <p style={{ fontSize: "13px", color: C.text, margin: 0, fontWeight: 400 }}>{label}</p>
        {desc && <p style={{ fontSize: "11px", color: C.textMuted, margin: "2px 0 0" }}>{desc}</p>}
      </div>
      <button onClick={onChange} style={{
        width: "34px", height: "18px", borderRadius: "9px", position: "relative", flexShrink: 0,
        background: checked ? C.accentDim : C.elevated,
        border: `1px solid ${checked ? C.borderFocus : C.border}`,
        cursor: "pointer", transition: "background 0.2s, border-color 0.2s",
      }}>
        <span style={{
          position: "absolute", top: "2px", width: "12px", height: "12px", borderRadius: "50%",
          background: checked ? C.accent : C.textMuted,
          left: checked ? "calc(100% - 15px)" : "2px", transition: "left 0.2s, background 0.2s",
        }} />
      </button>
    </div>
  );
}

function Divider() {
  return <div style={{ height: "1px", background: C.border, margin: "2px 0" }} />;
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "0 16px" }}>
      {children}
    </div>
  );
}

function ApplyBtn({ saved, onClick }: { saved: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: "7px", padding: "9px 18px", borderRadius: "8px", marginTop: "18px",
      background: saved ? "transparent" : C.accentDim,
      border: `1px solid ${saved ? C.success : C.borderFocus}`,
      color: saved ? C.success : C.accent,
      fontSize: "12px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
    }}>
      {saved ? <Check size={13} /> : <Zap size={13} />}
      {saved ? "Applied!" : "Apply Settings"}
    </button>
  );
}

const NAV: { id: Section; label: string; icon: any; adminOnly?: boolean }[] = [
  { id: "profile",    label: "Profile",     icon: User },
  { id: "get-links",  label: "Get Links",   icon: Link2 },
  { id: "appearance", label: "Appearance",  icon: Palette },
  { id: "cloaking",   label: "Cloaking",    icon: Shield },
  { id: "behavior",   label: "Behavior",    icon: Sliders },
  { id: "data",       label: "Data",        icon: Download },
  { id: "admin",      label: "Admin",       icon: UserCog, adminOnly: true },
  { id: "live",       label: "Live Sites",  icon: Radio, adminOnly: true },
  { id: "firefox-vm", label: "Firefox VM",  icon: Monitor, adminOnly: true },
  { id: "link-stats", label: "Link Stats",  icon: BarChart3, adminOnly: true },
  { id: "updates",    label: "Global Update", icon: Megaphone, adminOnly: true },
];

export default function AccountPage({ onNavigate }: { onNavigate: (url: string) => void }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>("profile");

  const [authMode, setAuthMode]   = useState<"signin" | "signup">("signin");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [authErr, setAuthErr]     = useState("");
  const [authOk, setAuthOk]       = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [username, setUsername]   = useState("");
  const [bio, setBio]             = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [profileColor, setProfileColor] = useState("#4d8dff");
  const [profilePublic, setProfilePublic] = useState(true);
  const [favoriteMusic, setFavoriteMusic] = useState<FavTrack[]>([]);
  const [likedPool, setLikedPool] = useState<FavTrack[]>([]);
  const [profSaving, setProfSaving] = useState(false);
  const [profMsg, setProfMsg]     = useState("");

  const avatarRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const bgImgRef = useRef<HTMLInputElement>(null);

  function openAboutBlank() {
    const w = window.open("about:blank", "_blank");
    if (!w || w.closed) { alert("Please allow popups for about:blank to work."); return; }
    w.document.title = localStorage.getItem("siteTitle") || "Home";
    const link = w.document.createElement("link");
    link.rel = "icon";
    link.href = localStorage.getItem("siteLogo") || "/logo.png";
    w.document.head.appendChild(link);
    const iframe = w.document.createElement("iframe");
    iframe.src = "/";
    iframe.style.cssText = "width:100vw;height:100vh;border:none;";
    w.document.body.style.margin = "0";
    w.document.body.appendChild(iframe);
  }

  const [s, setS] = useState<Record<string, string>>({});
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncNote, setSyncNote] = useState("");

  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSearch, setAdminSearch] = useState("");
  const [adminPage, setAdminPage] = useState(1);
  const [adminTotalPages, setAdminTotalPages] = useState(1);
  const [adminTotal, setAdminTotal] = useState(0);
  const [adminSearchActive, setAdminSearchActive] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [adminTab, setAdminTab] = useState<"users" | "staff">("users");
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [liveSites, setLiveSites] = useState<{ url: string; username?: string | null; viewers?: number; updatedAt: number }[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveClients, setLiveClients] = useState(0);
  const [liveUnique, setLiveUnique] = useState(0);
  const [ffLive, setFfLive] = useState<{ sessionId: string; userId: string; username?: string | null; startedAt: number; lastSeen: number }[]>([]);
  const [ffLiveCount, setFfLiveCount] = useState(0);
  const [ffDay, setFfDay] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [ffQuery, setFfQuery] = useState("");
  const [ffHistory, setFfHistory] = useState<{ sessionId: string; userId: string; username?: string | null; startedAt: number; lastSeen: number; endedAt?: number | null; active?: boolean }[]>([]);
  const [ffHistoryTotal, setFfHistoryTotal] = useState(0);
  const [ffHistoryLoading, setFfHistoryLoading] = useState(false);
  const [announcements, setAnnouncements] = useState<{ id: string; title: string; content: string; active: number; created_at: number }[]>([]);
  const [annTitle, setAnnTitle] = useState("");
  const [annContent, setAnnContent] = useState("");
  const [annBusy, setAnnBusy] = useState(false);
  const [annMsg, setAnnMsg] = useState("");

  const [linksStatus, setLinksStatus] = useState<{
    emailVerified: boolean;
    totpEnabled: boolean;
    weeklyLimit: number;
    remaining: number;
    weekEndsAt: number;
    claims: { id: string; blocker: string; link: string; claimedAt: number }[];
    blockers: string[];
    availableBlockers: string[];
  } | null>(null);
  const [linksLoading, setLinksLoading] = useState(false);
  const [linksErr, setLinksErr] = useState("");
  const [linksMsg, setLinksMsg] = useState("");
  const [selectedBlocker, setSelectedBlocker] = useState("securly");
  const [claimCode, setClaimCode] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);
  const [totpSetup, setTotpSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpBusy, setTotpBusy] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [linkStats, setLinkStats] = useState<any>(null);
  const [linkStatsLoading, setLinkStatsLoading] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);

  function hydrateProfile(u: AuthUser) {
    setUsername(u.username || "");
    setBio(u.bio || "");
    setDisplayName(u.display_name || "");
    setStatus(u.status || "");
    setLocation(u.location || "");
    setWebsite(u.website || "");
    setProfileColor(u.profile_color || "#4d8dff");
    setProfilePublic(u.profile_public !== false);
    setFavoriteMusic(u.favorite_music || []);
    setIsOwner(!!u.is_owner);
    try {
      const liked = JSON.parse(localStorage.getItem("petezah-music-liked") || "[]");
      if (Array.isArray(liked)) setLikedPool(liked);
    } catch {}
  }

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (d.user) {
          setUser(d.user);
          hydrateProfile(d.user);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      const wanted = sessionStorage.getItem("pz-account-section");
      if (wanted === "get-links" || wanted === "profile" || wanted === "appearance") {
        sessionStorage.removeItem("pz-account-section");
        setSection(wanted as Section);
      }
    } catch {}
  }, []);

  const loadLocalSettings = useCallback(() => {
    const keys = ["theme","siteTitle","siteLogo","panicKey","panicUrl","beforeUnload","disableRightClick","disableParticles","autocloak","backgroundColor","backgroundImage","bgNetwork"];
    const loaded: Record<string,string> = {};
    keys.forEach(k => { const v = localStorage.getItem(k); if (v !== null) loaded[k] = v; });
    if (!loaded.backgroundColor) loaded.backgroundColor = "#020810";
    if (loaded.bgNetwork === undefined) loaded.bgNetwork = "false";
    setS(loaded);
  }, []);

  useEffect(() => {
    loadLocalSettings();
  }, [loadLocalSettings]);

  useEffect(() => {
    if (!user) return;
    const onUpdated = () => loadLocalSettings();
    window.addEventListener("petezah-settings-updated", onUpdated);
    return () => window.removeEventListener("petezah-settings-updated", onUpdated);
  }, [user, loadLocalSettings]);

  const loadAdminUsers = useCallback((p: number, search?: string) => {
    setAdminLoading(true);
    const q = search?.trim();
    const url = q
      ? `/api/admin/users?search=${encodeURIComponent(q)}`
      : `/api/admin/users?page=${p}`;
    return fetch(url, { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        setAdminUsers(d.users || []);
        setAdminSearchActive(!!d.search);
        if (!d.search) {
          setAdminPage(d.page || p);
          setAdminTotalPages(d.totalPages || 1);
          setAdminTotal(d.total || 0);
        }
      })
      .finally(() => setAdminLoading(false));
  }, []);

  const loadStaff = useCallback(() => {
    setStaffLoading(true);
    return fetch("/api/admin/staff", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        setStaffList(d.staff || []);
        setIsOwner(!!d.is_owner);
      })
      .finally(() => setStaffLoading(false));
  }, []);

  useEffect(() => {
    if (section === "admin" && user && (user.is_admin ?? 0) >= 1) {
      loadAdminUsers(1);
      loadStaff();
    }
  }, [section, user, loadAdminUsers, loadStaff]);

  useEffect(() => {
    if (section !== "live" || !(user && ((user.is_admin ?? 0) >= 1 || user.is_owner))) return;
    let cancelled = false;
    const load = () => {
      setLiveLoading(true);
      fetch("/api/admin/live-sites", { credentials: "include" })
        .then((r) => r.json())
        .then((sites) => {
          if (cancelled) return;
          setLiveSites(sites.sites || []);
          setLiveClients(sites.clients || 0);
          setLiveUnique(sites.unique || 0);
        })
        .finally(() => {
          if (!cancelled) setLiveLoading(false);
        });
    };
    load();
    const t = window.setInterval(load, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [section, user]);

  const loadFfHistory = useCallback(() => {
    if (!(user && ((user.is_admin ?? 0) >= 1 || user.is_owner))) return;
    setFfHistoryLoading(true);
    const params = new URLSearchParams({ day: ffDay, limit: "100" });
    if (ffQuery.trim()) params.set("q", ffQuery.trim());
    fetch(`/api/admin/firefox-vm/history?${params}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setFfHistory(d.sessions || []);
        setFfHistoryTotal(d.total || 0);
      })
      .catch(() => {
        setFfHistory([]);
        setFfHistoryTotal(0);
      })
      .finally(() => setFfHistoryLoading(false));
  }, [user, ffDay, ffQuery]);

  useEffect(() => {
    if (section !== "firefox-vm" || !(user && ((user.is_admin ?? 0) >= 1 || user.is_owner))) return;
    let cancelled = false;
    const load = () => {
      fetch("/api/admin/firefox-vm/live", { credentials: "include" })
        .then((r) => r.json())
        .then((ff) => {
          if (cancelled) return;
          setFfLive(ff.sessions || []);
          setFfLiveCount(ff.active || 0);
        })
        .catch(() => {});
    };
    load();
    const t = window.setInterval(load, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [section, user]);

  useEffect(() => {
    if (section !== "firefox-vm" || !(user && ((user.is_admin ?? 0) >= 1 || user.is_owner))) return;
    loadFfHistory();
  }, [section, user, loadFfHistory]);

  const loadLinksStatus = useCallback(() => {
    if (!user) return;
    setLinksLoading(true);
    setLinksErr("");
    fetch("/api/links/status", { credentials: "include" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) {
          setLinksErr(d.error || "Failed to load");
          return;
        }
        setLinksStatus(d);
        setSelectedBlocker((prev) => {
          if (d.availableBlockers?.length && !d.availableBlockers.includes(prev)) {
            return d.availableBlockers[0];
          }
          return prev;
        });
      })
      .catch(() => setLinksErr("Network error"))
      .finally(() => setLinksLoading(false));
  }, [user]);

  useEffect(() => {
    if (section === "get-links" && user) loadLinksStatus();
  }, [section, user, loadLinksStatus]);

  useEffect(() => {
    if (section !== "link-stats" || !(user && ((user.is_admin ?? 0) >= 1 || user.is_owner))) return;
    let cancelled = false;
    const load = () => {
      setLinkStatsLoading(true);
      fetch("/api/admin/link-stats", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled) setLinkStats(d);
        })
        .catch(() => {
          if (!cancelled) setLinkStats(null);
        })
        .finally(() => {
          if (!cancelled) setLinkStatsLoading(false);
        });
    };
    load();
    const t = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [section, user]);

  useEffect(() => {
    if (section !== "updates" || !(user && ((user.is_admin ?? 0) >= 1 || user.is_owner))) return;
    fetch("/api/admin/announcements", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setAnnouncements(d.announcements || []))
      .catch(() => {});
  }, [section, user]);

  async function createAnnouncement() {
    if (!annTitle.trim() || !annContent.trim()) return;
    setAnnBusy(true);
    setAnnMsg("");
    try {
      const r = await fetch("/api/admin/announcements", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: annTitle.trim(), content: annContent.trim() }),
      });
      const d = await r.json();
      if (!r.ok) {
        setAnnMsg(d.error || "Failed");
        return;
      }
      setAnnouncements((prev) => [d.announcement, ...prev]);
      setAnnTitle("");
      setAnnContent("");
      setAnnMsg("Posted — users will see it once");
    } finally {
      setAnnBusy(false);
      setTimeout(() => setAnnMsg(""), 2500);
    }
  }

  async function toggleAnnouncement(id: string, active: boolean) {
    const r = await fetch(`/api/admin/announcements/${id}/active`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    const d = await r.json();
    if (r.ok && d.announcement) {
      setAnnouncements((prev) => prev.map((a) => (a.id === id ? d.announcement : a)));
    }
  }

  useEffect(() => {
    if (section !== "admin" || !(user && (user.is_admin ?? 0) >= 1)) return;
    const q = adminSearch.trim();
    if (!q) return;
    const t = setTimeout(() => loadAdminUsers(1, q), 300);
    return () => clearTimeout(t);
  }, [adminSearch, section, user, loadAdminUsers]);

  async function openUserDetail(userId: string) {
    setDetailLoading(true);
    setSelectedUser(null);
    try {
      const r = await fetch(`/api/admin/users/${userId}`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setSelectedUser(d.user);
      }
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthErr(""); setAuthOk(""); setAuthLoading(true);
    try {
      const r = await fetch(`/api/${authMode}`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, password }), credentials: "include",
      });
      const d = await r.json();
      if (!r.ok) setAuthErr(d.error || "Something went wrong");
      else if (authMode === "signup") { setAuthOk(d.message || "Account created! Check your email to verify."); setAuthMode("signin"); setPassword(""); }
      else {
        setUser(d.user);
        hydrateProfile(d.user);
        notifyAuthChanged();
        const result = await reconcileSettings();
        loadLocalSettings();
        if (result === "pulled") setSyncNote("Synced from your account");
        else if (result === "pushed") setSyncNote("Local settings uploaded");
        setTimeout(() => setSyncNote(""), 3000);
        const pending = consumePendingAuth();
        if (pending?.type === "tor") {
          await applyVpnRegion("tor");
          onNavigate("petezah://newtab");
        } else if (pending?.type === "movies") {
          onNavigate("petezah://movies");
        } else if (pending?.type === "feedback") {
          onNavigate("petezah://feedback");
        } else if (pending?.type === "firefox" || pending?.type === "vm") {
          onNavigate("petezah://vm");
        }
      }
    } catch { setAuthErr("Network error. Please try again."); }
    finally { setAuthLoading(false); }
  }

  async function resendVerification() {
    if (!email.trim()) {
      setAuthErr("Enter your email first.");
      return;
    }
    setResendBusy(true);
    setAuthErr("");
    setAuthOk("");
    try {
      const r = await fetch("/api/verify-email/resend", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const d = await r.json();
      if (!r.ok) setAuthErr(d.error || "Could not resend");
      else setAuthOk(d.message || "Check your inbox.");
    } catch {
      setAuthErr("Network error.");
    } finally {
      setResendBusy(false);
    }
  }

  async function startTotpSetup() {
    setTotpBusy(true);
    setLinksErr("");
    setLinksMsg("");
    try {
      const r = await fetch("/api/links/2fa/setup", { method: "POST", credentials: "include" });
      const d = await r.json();
      if (!r.ok) {
        setLinksErr(d.error || "Setup failed");
        return;
      }
      setTotpSetup({ secret: d.secret, qrDataUrl: d.qrDataUrl });
      setTotpCode("");
    } catch {
      setLinksErr("Network error");
    } finally {
      setTotpBusy(false);
    }
  }

  async function enableTotp() {
    setTotpBusy(true);
    setLinksErr("");
    try {
      const r = await fetch("/api/links/2fa/enable", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpCode.trim() }),
      });
      const d = await r.json();
      if (!r.ok) {
        setLinksErr(d.error || "Invalid code");
        return;
      }
      setTotpSetup(null);
      setTotpCode("");
      setLinksMsg("2FA enabled");
      setUser((u) => (u ? { ...u, totp_enabled: true } : u));
      loadLinksStatus();
      setTimeout(() => setLinksMsg(""), 2500);
    } catch {
      setLinksErr("Network error");
    } finally {
      setTotpBusy(false);
    }
  }

  async function disableTotp() {
    setTotpBusy(true);
    setLinksErr("");
    try {
      const r = await fetch("/api/links/2fa/disable", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: disableCode.trim(), password: disablePassword }),
      });
      const d = await r.json();
      if (!r.ok) {
        setLinksErr(d.error || "Could not disable 2FA");
        return;
      }
      setDisableCode("");
      setDisablePassword("");
      setLinksMsg("2FA disabled");
      setUser((u) => (u ? { ...u, totp_enabled: false } : u));
      loadLinksStatus();
      setTimeout(() => setLinksMsg(""), 2500);
    } catch {
      setLinksErr("Network error");
    } finally {
      setTotpBusy(false);
    }
  }

  async function claimLink() {
    setClaimBusy(true);
    setLinksErr("");
    setLinksMsg("");
    try {
      const body: Record<string, string> = { blocker: selectedBlocker };
      if (linksStatus?.totpEnabled) body.code = claimCode.trim();
      const r = await fetch("/api/links/claim", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) {
        setLinksErr(d.error || "Claim failed");
        return;
      }
      setClaimCode("");
      setLinksMsg(`Got link: ${d.claim?.link}`);
      loadLinksStatus();
    } catch {
      setLinksErr("Network error");
    } finally {
      setClaimBusy(false);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setLinksMsg("Copied");
      setTimeout(() => setLinksMsg(""), 1500);
    } catch {}
  }

  async function saveProfile() {
    setProfSaving(true); setProfMsg("");
    try {
      const r = await fetch("/api/me", {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({
          username,
          bio,
          display_name: displayName,
          status,
          location,
          website,
          profile_color: profileColor,
          profile_public: profilePublic,
          favorite_music: favoriteMusic,
        }),
      });
      const d = await r.json();
      if (r.ok) {
        const saved = d.user || {
          username,
          bio,
          display_name: displayName,
          status,
          location,
          website,
          profile_color: profileColor,
          profile_public: profilePublic,
          favorite_music: favoriteMusic,
        };
        setUser(u => u ? { ...u, ...saved } : u);
        hydrateProfile({ ...(user as AuthUser), ...saved });
        setProfMsg("Saved!");
        notifyAuthChanged();
        window.dispatchEvent(new CustomEvent("petezah-profile-updated", { detail: saved }));
      } else setProfMsg(d.error || "Failed to save.");
    } finally { setProfSaving(false); setTimeout(() => setProfMsg(""), 2500); }
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setAvatarUploading(true);
    try {
      const r = await fetch("/api/me/avatar", {
        method: "POST", headers: { "Content-Type": file.type }, credentials: "include", body: file,
      });
      if (r.ok) { const d = await r.json(); setUser(u => u ? { ...u, avatar_url: d.avatar_url } : u); }
    } finally { setAvatarUploading(false); e.target.value = ""; }
  }

  async function uploadBanner(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setBannerUploading(true);
    try {
      const r = await fetch("/api/me/banner", {
        method: "POST", headers: { "Content-Type": file.type }, credentials: "include", body: file,
      });
      if (r.ok) { const d = await r.json(); setUser(u => u ? { ...u, banner_url: d.banner_url } : u); }
    } finally { setBannerUploading(false); e.target.value = ""; }
  }

  function toggleFavoriteTrack(track: FavTrack) {
    setFavoriteMusic(prev => {
      if (prev.some(t => t.id === track.id)) return prev.filter(t => t.id !== track.id);
      if (prev.length >= 12) return prev;
      return [...prev, track];
    });
  }

  async function signout() {
    await fetch("/api/signout", { method: "POST", credentials: "include" });
    setUser(null); setEmail(""); setPassword("");
    notifyAuthChanged();
  }

  const setVal = (k: string, v: string) => setS(prev => ({ ...prev, [k]: v }));
  const toggle = (k: string) => setS(prev => ({ ...prev, [k]: prev[k] === "true" ? "false" : "true" }));

  async function applySettings() {
    applySettingsNow(s);
    setSettingsSaved(true);
    if (user) {
      const ok = await pushSettings();
      setSyncNote(ok ? "Saved to account" : "Saved locally only");
      setTimeout(() => setSyncNote(""), 2500);
    }
    setTimeout(() => setSettingsSaved(false), 1500);
  }

  async function runManualSync(direction: "pull" | "push") {
    setSyncBusy(true);
    setSyncNote("");
    try {
      if (direction === "pull") {
        const ok = await pullSettings();
        loadLocalSettings();
        const loaded: Record<string, string> = {};
        ["theme","siteTitle","siteLogo","panicKey","panicUrl","beforeUnload","disableRightClick","disableParticles","autocloak","backgroundColor","backgroundImage","bgNetwork"].forEach(k => {
          const v = localStorage.getItem(k);
          if (v !== null) loaded[k] = v;
        });
        applySettingsNow(loaded);
        setSyncNote(ok ? "Downloaded from account" : "Could not download");
      } else {
        const ok = await pushSettings();
        setSyncNote(ok ? "Uploaded to account" : "Could not upload");
      }
    } finally {
      setSyncBusy(false);
      setTimeout(() => setSyncNote(""), 3000);
    }
  }

  function exportData() {
    const data = { localStorage: Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "petezah-data.json"; a.click();
  }

  function importData(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.localStorage) {
          Object.entries(data.localStorage).forEach(([k, v]) => localStorage.setItem(k, String(v)));
          const keys = ["theme","siteTitle","siteLogo","panicKey","panicUrl","beforeUnload","disableRightClick","disableParticles","autocloak"];
          const loaded: Record<string,string> = {};
          keys.forEach(k => { const v = localStorage.getItem(k); if (v !== null) loaded[k] = v; });
          setS(loaded); applySettingsNow(loaded);
          if (user) schedulePushSettings(800);
        }
      } catch {}
    };
    reader.readAsText(file); e.target.value = "";
  }

  function resetData() {
    if (!confirm("Reset all local settings? This cannot be undone.")) return;
    localStorage.clear(); setS({}); document.title = "PeteZah";
  }

  async function adminAction(userId: string, action: string) {
    const r = await fetch("/api/admin/user-action", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ userId, action }),
    });
    const d = await r.json();
    if (!r.ok) {
      alert(d.error || "Action failed");
      return;
    }
    const patchRole = (is_admin: number) => {
      setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, is_admin } : u));
      setStaffList(prev => prev.map(u => u.id === userId ? { ...u, is_admin } : u)
        .filter(u => action === "demote_admin" && is_admin === 0 ? u.id !== userId : true));
    };
    if (action === "ban") {
      setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, banned: 1, email_verified: 0 } : u));
      setStaffList(prev => prev.map(u => u.id === userId ? { ...u, banned: 1 } : u));
    } else if (action === "unban") {
      setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, banned: 0 } : u));
      setStaffList(prev => prev.map(u => u.id === userId ? { ...u, banned: 0 } : u));
    } else if (action === "suspend") {
      setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, email_verified: 0 } : u));
    } else if (action === "promote_admin") patchRole(3);
    else if (action === "staff") patchRole(2);
    else if (action === "promote_mod") patchRole(1);
    else if (action === "demote_admin") patchRole(0);
    else if (action === "delete") {
      setAdminUsers(prev => prev.filter(u => u.id !== userId));
      setStaffList(prev => prev.filter(u => u.id !== userId));
    }
    if (selectedUser?.id === userId) {
      const detail = await fetch(`/api/admin/users/${userId}`, { credentials: "include" });
      if (detail.ok) {
        const data = await detail.json();
        setSelectedUser(data.user);
      } else if (action === "delete") {
        setSelectedUser(null);
      }
    }
    if (adminTab === "staff" || action.includes("promote") || action.includes("demote") || action === "staff") {
      loadStaff();
    }
  }

  const roleLabel = (n: number, owner = false) => owner ? "Owner" : n >= 3 ? "Admin" : n >= 2 ? "Staff" : n >= 1 ? "Mod" : "User";
  const roleColor = (n: number, owner = false) => owner ? "hsl(38 90% 58%)" : n >= 3 ? C.accent : n >= 2 ? "hsl(270 55% 65%)" : n >= 1 ? "hsl(165 50% 52%)" : C.textMuted;

  const isAdmin = (user?.is_admin ?? 0) >= 1 || !!user?.is_owner;
  const visibleSections = NAV.filter(s => !s.adminOnly || isAdmin);

  if (loading) return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}>
      <Loader2 size={20} className="animate-spin" style={{ color: C.accent }} />
    </div>
  );

  if (!user) return (
    <div style={{ height: "100%", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", overflow: "hidden" }}>

      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: "320px", padding: "0 20px" }}
      >
        <div style={{
          background: "hsla(216, 32%, 7%, 0.75)", backdropFilter: "blur(20px)",
          border: `1px solid ${C.border}`, borderRadius: "14px", padding: "28px 24px",
          boxShadow: "0 24px 48px hsla(216, 50%, 4%, 0.5)",
        }}>
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "10px", margin: "0 auto 12px",
              background: C.accentDim, border: `1px solid ${C.borderFocus}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <User size={18} color={C.accent} />
            </div>
            <h2 style={{ fontSize: "15px", fontWeight: 700, color: C.text, margin: "0 0 3px" }}>
              {authMode === "signin" ? "Welcome back" : "Create account"}
            </h2>
            <p style={{ fontSize: "11px", color: C.textSub, margin: 0 }}>
              {authMode === "signin" ? "Sign in to sync your settings" : "Get started with PeteZah"}
            </p>
          </div>

          <AnimatePresence mode="wait">
            {authErr && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", borderRadius: "7px", marginBottom: "14px",
                  background: "hsl(0 60% 50% / 0.08)", border: "1px solid hsl(0 60% 50% / 0.2)", color: "hsl(0 60% 68%)", fontSize: "11px" }}>
                <AlertCircle size={11} style={{ flexShrink: 0 }} />{authErr}
              </motion.div>
            )}
            {authOk && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", borderRadius: "7px", marginBottom: "14px",
                  background: "hsl(145 50% 42% / 0.1)", border: "1px solid hsl(145 50% 42% / 0.25)", color: "hsl(145 50% 60%)", fontSize: "11px" }}>
                <Check size={11} style={{ flexShrink: 0 }} />{authOk}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <Field type="email" value={email} onChange={(e: any) => setEmail(e.target.value)} placeholder="Email address" icon={Mail} />
            <Field type="password" value={password} onChange={(e: any) => setPassword(e.target.value)} placeholder="Password" icon={KeyRound} />
            <button type="submit" disabled={authLoading} style={{
              marginTop: "4px", width: "100%", padding: "10px", borderRadius: "8px", border: `1px solid ${C.borderFocus}`,
              background: C.accentDim, color: C.text, fontSize: "13px", fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
              cursor: authLoading ? "not-allowed" : "pointer", opacity: authLoading ? 0.7 : 1, transition: "opacity 0.2s",
            }}>
              {authLoading && <Loader2 size={13} className="animate-spin" />}
              {authMode === "signin" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <button
            onClick={() => { setAuthMode(m => m === "signin" ? "signup" : "signin"); setAuthErr(""); setAuthOk(""); }}
            style={{ width: "100%", marginTop: "14px", background: "none", border: "none", cursor: "pointer",
              fontSize: "11px", color: C.textSub, textAlign: "center", transition: "color 0.15s" }}
            onMouseEnter={e => (e.currentTarget.style.color = C.text)}
            onMouseLeave={e => (e.currentTarget.style.color = C.textSub)}>
            {authMode === "signin" ? "No account? Create one" : "Already have an account? Sign in"}
          </button>
          {authMode === "signin" && (
            <button
              type="button"
              onClick={resendVerification}
              disabled={resendBusy}
              style={{
                width: "100%", marginTop: 8, background: "none", border: "none", cursor: resendBusy ? "not-allowed" : "pointer",
                fontSize: 11, color: C.accent, textAlign: "center", opacity: resendBusy ? 0.6 : 1,
              }}
            >
              {resendBusy ? "Sending…" : "Resend verification email"}
            </button>
          )}
        </div>
        <div style={{ marginTop: "12px" }}>
          <HypeAd />
        </div>
      </motion.div>
    </div>
  );

  const avatarLetter = (user.username || user.email)[0].toUpperCase();

  return (
    <div style={{ height: "100%", display: "flex", background: "hsla(216, 32%, 6%, 0.72)", backdropFilter: "blur(18px)", overflow: "hidden" }}>

      <div style={{
        width: "190px", flexShrink: 0, display: "flex", flexDirection: "column",
        borderRight: `1px solid ${C.border}`, padding: "18px 10px",
        background: C.surface,
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", marginBottom: "20px", paddingBottom: "16px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ position: "relative" }}>
            <div style={{
              width: "48px", height: "48px", borderRadius: "14px", overflow: "hidden",
              background: C.accentDim, border: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "18px", fontWeight: 700, color: C.accent,
            }}>
              {user.avatar_url
                ? <img src={user.avatar_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                : avatarLetter}
            </div>
            <button onClick={() => avatarRef.current?.click()} style={{
              position: "absolute", bottom: "-3px", right: "-3px", width: "18px", height: "18px", borderRadius: "50%",
              background: C.accentDim, border: `2px solid ${C.bg}`, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {avatarUploading ? <Loader2 size={8} color={C.accent} className="animate-spin" /> : <Camera size={8} color={C.accent} />}
            </button>
            <input ref={avatarRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" style={{ display: "none" }} onChange={uploadAvatar} />
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: C.text }}>{user.username || user.email.split("@")[0]}</span>
              {((user.is_admin ?? 0) > 0 || user.is_owner) && (
                <span style={{ fontSize: "8px", fontWeight: 700, padding: "1px 4px", borderRadius: "4px",
                  background: `${roleColor(user.is_admin ?? 0, user.is_owner)}18`, color: roleColor(user.is_admin ?? 0, user.is_owner), border: `1px solid ${roleColor(user.is_admin ?? 0, user.is_owner)}30` }}>
                  {roleLabel(user.is_admin ?? 0, user.is_owner)}
                </span>
              )}
            </div>
            <p style={{ fontSize: "9px", color: C.textMuted, margin: "2px 0 0" }}>{user.email}</p>
          </div>
        </div>

        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1px" }}>
          {visibleSections.map(({ id, label, icon: Icon }) => {
            const active = section === id;
            return (
              <button key={id} onClick={() => setSection(id)} style={{
                display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px", borderRadius: "7px", width: "100%",
                background: active ? `${C.accentDim}50` : "transparent",
                border: `1px solid ${active ? C.borderFocus : "transparent"}`,
                color: active ? C.accent : C.textSub,
                fontSize: "12px", fontWeight: active ? 600 : 400, cursor: "pointer", transition: "all 0.12s", textAlign: "left",
              }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.background = C.elevated; e.currentTarget.style.color = C.text; } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.textSub; } }}>
                <Icon size={12} />
                {label}
              </button>
            );
          })}
        </nav>

        <button onClick={signout} style={{
          display: "flex", alignItems: "center", gap: "7px", padding: "8px 10px", borderRadius: "7px",
          background: "transparent", border: `1px solid transparent`,
          color: C.textMuted, fontSize: "11px", fontWeight: 500, cursor: "pointer", marginTop: "6px", transition: "all 0.12s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "hsl(0 60% 50% / 0.08)"; e.currentTarget.style.color = C.danger; e.currentTarget.style.borderColor = "hsl(0 60% 50% / 0.2)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.textMuted; e.currentTarget.style.borderColor = "transparent"; }}>
          <LogOut size={11} />Sign out
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "28px 30px", scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent` }}>
        <AnimatePresence mode="wait">
          <motion.div key={section} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.13 }}>

            {section === "profile" && (
              <div style={{ maxWidth: "520px" }}>
                <h2 style={{ fontSize: "15px", fontWeight: 700, color: C.text, margin: "0 0 3px" }}>Profile</h2>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 22px" }}>
                  {user.created_at ? `Member since ${new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}` : "Manage your profile"}
                </p>

                <div style={{
                  position: "relative", height: 90, borderRadius: 12, overflow: "hidden",
                  background: `linear-gradient(135deg, ${profileColor}55, hsl(216 22% 12%))`,
                  border: `1px solid ${C.border}`, marginBottom: 18,
                }}>
                  {user.banner_url && (
                    <img src={user.banner_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  )}
                  <button onClick={() => bannerRef.current?.click()} style={{
                    position: "absolute", right: 10, bottom: 10, display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 10px", borderRadius: 7, background: "hsl(216 32% 6% / 0.75)",
                    border: `1px solid ${C.border}`, color: C.textSub, fontSize: 10, cursor: "pointer",
                  }}>
                    {bannerUploading ? <Loader2 size={10} className="animate-spin" /> : <Image size={10} />}
                    Banner
                  </button>
                  <input ref={bannerRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" style={{ display: "none" }} onChange={uploadBanner} />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <Field label="Username" value={username} onChange={(e: any) => setUsername(e.target.value)} placeholder="petezah" maxLength={32} icon={User} />
                  {username && (
                    <button
                      onClick={() => onNavigate(`petezah://user/@${username}`)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8,
                        background: C.surface, border: `1px solid ${C.border}`, color: C.accent,
                        fontSize: 11, fontWeight: 600, cursor: "pointer", width: "fit-content",
                      }}
                    >
                      <ExternalLink size={11} /> /user/@{username}
                    </button>
                  )}
                  <Field label="Display name" value={displayName} onChange={(e: any) => setDisplayName(e.target.value)} placeholder="How you appear" maxLength={48} icon={User} />
                  <Field label="Status" value={status} onChange={(e: any) => setStatus(e.target.value)} placeholder="What you're up to" maxLength={80} icon={Zap} />
                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px", color: C.textMuted }}>Bio</label>
                    <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="A short bio..." maxLength={280} rows={3}
                      style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px",
                        color: C.text, fontSize: "13px", padding: "9px 12px", outline: "none", resize: "none",
                        fontFamily: "inherit", boxSizing: "border-box", transition: "border-color 0.15s" }}
                      onFocus={e => (e.currentTarget.style.borderColor = C.borderFocus)}
                      onBlur={e => (e.currentTarget.style.borderColor = C.border)} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Field label="Location" value={location} onChange={(e: any) => setLocation(e.target.value)} placeholder="City" maxLength={64} icon={MapPin} />
                    <Field label="Website" value={website} onChange={(e: any) => setWebsite(e.target.value)} placeholder="https://" maxLength={200} icon={Link2} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px", color: C.textMuted }}>Profile color</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input type="color" value={profileColor} onChange={e => setProfileColor(e.target.value)}
                        style={{ width: 36, height: 36, border: "none", background: "none", cursor: "pointer" }} />
                      <input type="text" value={profileColor} onChange={e => setProfileColor(e.target.value)}
                        style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12, padding: "8px 10px", fontFamily: "monospace", outline: "none" }} />
                    </div>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 12, color: C.textSub }}>
                    <input type="checkbox" checked={profilePublic} onChange={e => setProfilePublic(e.target.checked)} />
                    Public profile visible at /user/@{username || "you"}
                  </label>

                  <Divider />
                  <div>
                    <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
                      <Music2 size={11} /> Favorite music on profile ({favoriteMusic.length}/12)
                    </p>
                    <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 10px" }}>
                      Pick from tracks you've liked in Music. They show on your public profile.
                    </p>
                    {favoriteMusic.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                        {favoriteMusic.map(t => (
                          <div key={t.id} style={{
                            display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8,
                            background: C.surface, border: `1px solid ${C.border}`,
                          }}>
                            {t.artwork && <img src={t.artwork} alt="" style={{ width: 28, height: 28, borderRadius: 5, objectFit: "cover" }} />}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 11, fontWeight: 600, color: C.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</p>
                              <p style={{ fontSize: 9, color: C.textMuted, margin: 0 }}>{t.artist}</p>
                            </div>
                            <button onClick={() => toggleFavoriteTrack(t)} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", display: "flex" }}>
                              <Trash2 size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {likedPool.length === 0 ? (
                      <button onClick={() => onNavigate("petezah://music")} style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8,
                        background: C.accentDim, border: `1px solid ${C.borderFocus}`, color: C.accent,
                        fontSize: 11, fontWeight: 600, cursor: "pointer",
                      }}>
                        <Heart size={11} /> Like songs in Music first
                      </button>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 180, overflowY: "auto" }}>
                        {likedPool.map(t => {
                          const on = favoriteMusic.some(f => f.id === t.id);
                          return (
                            <button key={t.id} onClick={() => toggleFavoriteTrack(t)} style={{
                              display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8,
                              background: on ? C.accentDim : C.elevated, border: `1px solid ${on ? C.borderFocus : C.border}`,
                              cursor: "pointer", textAlign: "left", color: C.text,
                            }}>
                              {t.artwork && <img src={t.artwork} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: "cover" }} />}
                              <span style={{ flex: 1, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                              {on ? <Check size={11} color={C.accent} /> : <Plus size={11} color={C.textMuted} />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: 4 }}>
                    <button onClick={saveProfile} disabled={profSaving} style={{
                      display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px",
                      background: C.accentDim, border: `1px solid ${C.borderFocus}`,
                      color: C.accent, fontSize: "12px", fontWeight: 600, cursor: "pointer", opacity: profSaving ? 0.6 : 1, transition: "opacity 0.2s",
                    }}>
                      {profSaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                      Save profile
                    </button>
                    {profMsg && <span style={{ fontSize: "11px", color: profMsg === "Saved!" ? C.success : C.danger }}>{profMsg}</span>}
                  </div>
                </div>

                <Divider />
                <div style={{ marginTop: "18px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 6px" }}>Community</p>
                  {[
                    { label: "Changelog", desc: "See what's new", url: "petezah://changelog", icon: Megaphone },
                    { label: "Feedback", desc: "Share your thoughts", url: "petezah://feedback", icon: MessageSquare },
                    { label: "Music", desc: "Find songs for your profile", url: "petezah://music", icon: Music2 },
                  ].map(({ label, desc, url, icon: Icon }) => (
                    <button key={url} onClick={() => onNavigate(url)} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "9px",
                      background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer", width: "100%", transition: "border-color 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = C.borderFocus)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <Icon size={12} style={{ color: C.accent }} />
                        <div style={{ textAlign: "left" }}>
                          <p style={{ fontSize: "12px", fontWeight: 500, color: C.text, margin: 0 }}>{label}</p>
                          <p style={{ fontSize: "10px", color: C.textSub, margin: 0 }}>{desc}</p>
                        </div>
                      </div>
                      <ChevronRight size={11} style={{ color: C.textMuted }} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {section === "get-links" && (
              <div style={{ maxWidth: "520px" }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 3px" }}>Get Links</h2>
                <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 18px" }}>
                  Verified accounts get {linksStatus?.weeklyLimit ?? 2} links per week. This week&apos;s claims stay visible until the week resets.
                </p>

                {linksLoading && !linksStatus ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                    <Loader2 size={18} className="animate-spin" style={{ color: C.accent }} />
                  </div>
                ) : (
                  <>
                    <div style={{
                      display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", borderRadius: 10,
                      background: C.surface, border: `1px solid ${C.border}`, marginBottom: 16,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                        <span style={{ color: C.textSub }}>Email</span>
                        <span style={{ color: linksStatus?.emailVerified ? C.success : C.danger, fontWeight: 600 }}>
                          {linksStatus?.emailVerified ? "Verified" : "Not verified"}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                        <span style={{ color: C.textSub }}>Remaining this week</span>
                        <span style={{ color: C.text, fontWeight: 600 }}>
                          {linksStatus?.remaining ?? 0} / {linksStatus?.weeklyLimit ?? 2}
                        </span>
                      </div>
                      {linksStatus?.weekEndsAt ? (
                        <p style={{ margin: 0, fontSize: 10, color: C.textMuted }}>
                          Week resets {new Date(linksStatus.weekEndsAt).toLocaleString()}
                        </p>
                      ) : null}
                    </div>

                    {!linksStatus?.emailVerified && (
                      <div style={{
                        padding: "12px 14px", borderRadius: 10, marginBottom: 16,
                        background: "hsl(0 60% 50% / 0.08)", border: "1px solid hsl(0 60% 50% / 0.2)",
                        color: "hsl(0 60% 68%)", fontSize: 12, lineHeight: 1.45,
                      }}>
                        Verify your email to request links. Check your inbox or use Resend on the sign-in screen if needed.
                      </div>
                    )}

                    <Divider />
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
                      <ShieldCheck size={11} /> Two-factor authentication
                    </p>
                    <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 12px" }}>
                      Optional but recommended. When enabled, claiming a link requires your authenticator code.
                    </p>

                    {linksStatus?.totpEnabled ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                        <div style={{
                          display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8,
                          background: "hsl(145 50% 42% / 0.1)", border: "1px solid hsl(145 50% 42% / 0.25)",
                          color: C.success, fontSize: 12, fontWeight: 600,
                        }}>
                          <ShieldCheck size={12} /> 2FA is on
                        </div>
                        <Field type="password" value={disablePassword} onChange={(e: any) => setDisablePassword(e.target.value)} placeholder="Account password" icon={Lock} />
                        <Field value={disableCode} onChange={(e: any) => setDisableCode(e.target.value)} placeholder="6-digit code" icon={KeyRound} maxLength={6} />
                        <button
                          onClick={disableTotp}
                          disabled={totpBusy}
                          style={{
                            alignSelf: "flex-start", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                            background: "hsl(0 60% 50% / 0.1)", border: "1px solid hsl(0 60% 50% / 0.25)", color: C.danger,
                            opacity: totpBusy ? 0.6 : 1,
                          }}
                        >
                          Disable 2FA
                        </button>
                      </div>
                    ) : totpSetup ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                        <img src={totpSetup.qrDataUrl} alt="2FA QR" style={{ width: 160, height: 160, borderRadius: 10, alignSelf: "flex-start", background: "#fff" }} />
                        <p style={{ margin: 0, fontSize: 11, color: C.textSub, wordBreak: "break-all" }}>
                          Secret: <span style={{ color: C.text, fontFamily: "monospace" }}>{totpSetup.secret}</span>
                        </p>
                        <Field value={totpCode} onChange={(e: any) => setTotpCode(e.target.value)} placeholder="Enter code from app" icon={KeyRound} maxLength={6} />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={enableTotp}
                            disabled={totpBusy || totpCode.trim().length !== 6}
                            style={{
                              padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                              background: C.accentDim, border: `1px solid ${C.borderFocus}`, color: C.accent,
                              opacity: totpBusy ? 0.6 : 1,
                            }}
                          >
                            Confirm & enable
                          </button>
                          <button
                            onClick={() => { setTotpSetup(null); setTotpCode(""); }}
                            style={{
                              padding: "8px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer",
                              background: C.elevated, border: `1px solid ${C.border}`, color: C.textSub,
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={startTotpSetup}
                        disabled={totpBusy || !linksStatus?.emailVerified}
                        style={{
                          display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 8, marginBottom: 16,
                          background: C.accentDim, border: `1px solid ${C.borderFocus}`, color: C.accent,
                          fontSize: 12, fontWeight: 600, cursor: linksStatus?.emailVerified ? "pointer" : "not-allowed",
                          opacity: !linksStatus?.emailVerified || totpBusy ? 0.55 : 1,
                        }}
                      >
                        <Shield size={12} /> Set up 2FA
                      </button>
                    )}

                    <Divider />
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 10px" }}>
                      Request a link
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                      <label style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.textMuted }}>Blocker</label>
                      <select
                        value={selectedBlocker}
                        onChange={(e) => setSelectedBlocker(e.target.value)}
                        style={{
                          width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                          color: C.text, fontSize: 12, padding: "9px 11px", outline: "none",
                        }}
                      >
                        {(linksStatus?.blockers || []).map((b) => (
                          <option key={b} value={b} disabled={linksStatus?.availableBlockers && !linksStatus.availableBlockers.includes(b)}>
                            {b.replace(/_/g, " ")}
                            {linksStatus?.availableBlockers && !linksStatus.availableBlockers.includes(b) ? " (empty)" : ""}
                          </option>
                        ))}
                      </select>
                      {linksStatus?.totpEnabled && (
                        <Field value={claimCode} onChange={(e: any) => setClaimCode(e.target.value)} placeholder="Authenticator code" icon={KeyRound} maxLength={6} />
                      )}
                      <button
                        onClick={claimLink}
                        disabled={
                          claimBusy ||
                          !linksStatus?.emailVerified ||
                          (linksStatus?.remaining ?? 0) <= 0 ||
                          (linksStatus?.totpEnabled && claimCode.trim().length !== 6)
                        }
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                          padding: "10px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                          background: C.accentDim, border: `1px solid ${C.borderFocus}`, color: C.accent,
                          opacity: claimBusy || !linksStatus?.emailVerified || (linksStatus?.remaining ?? 0) <= 0 ? 0.55 : 1,
                        }}
                      >
                        {claimBusy ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                        Get link
                      </button>
                    </div>

                    {(linksErr || linksMsg) && (
                      <p style={{ fontSize: 11, margin: "0 0 14px", color: linksErr ? C.danger : C.success }}>
                        {linksErr || linksMsg}
                      </p>
                    )}

                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
                      This week&apos;s links
                    </p>
                    {!linksStatus?.claims?.length ? (
                      <p style={{ fontSize: 12, color: C.textMuted }}>No links claimed this week yet.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {linksStatus.claims.map((c) => (
                          <div
                            key={c.id}
                            style={{
                              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 9,
                              background: C.surface, border: `1px solid ${C.border}`,
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontSize: 12, color: C.text, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {c.link}
                              </p>
                              <p style={{ margin: "2px 0 0", fontSize: 10, color: C.textMuted }}>
                                {c.blocker.replace(/_/g, " ")} · {new Date(c.claimedAt).toLocaleString()}
                              </p>
                            </div>
                            <button
                              onClick={() => copyText(c.link)}
                              title="Copy"
                              style={{
                                width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center",
                                background: C.elevated, border: `1px solid ${C.border}`, color: C.textSub, cursor: "pointer",
                              }}
                            >
                              <Copy size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {section === "appearance" && (
              <div style={{ maxWidth: "520px" }}>
                <h2 style={{ fontSize: "15px", fontWeight: 700, color: C.text, margin: "0 0 3px" }}>Appearance</h2>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 20px" }}>
                  Dark space backdrop, chrome accents, and optional network lines
                </p>

                <div style={{
                  height: 110, borderRadius: 12, marginBottom: 18, overflow: "hidden", position: "relative",
                  border: `1px solid ${C.border}`,
                  background: s.backgroundImage
                    ? `url(${s.backgroundImage}) center/cover`
                    : (s.backgroundColor || "#020810"),
                }}>
                  {!s.backgroundImage && (
                    <div style={{
                      position: "absolute", inset: 0,
                      background: `
                        radial-gradient(ellipse 60% 50% at 50% 45%, hsla(210,90%,70%,0.12), transparent 60%),
                        conic-gradient(from 200deg at 50% 50%, transparent 0deg, hsla(205,100%,85%,0.08) 10deg, transparent 20deg, transparent 80deg, hsla(0,0%,100%,0.05) 90deg, transparent 100deg)
                      `,
                      mixBlendMode: "screen",
                    }} />
                  )}
                  <div style={{
                    position: "absolute", left: 12, bottom: 10, fontSize: 10, fontWeight: 600,
                    color: "hsla(0,0%,100%,0.75)", letterSpacing: "0.04em", textTransform: "uppercase",
                  }}>
                    Live preview
                  </div>
                </div>

                <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 10px" }}>Atmosphere</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "7px", marginBottom: "18px" }}>
                  {THEMES.map(t => {
                    const active = (s.theme || "default") === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          const next = {
                            ...s,
                            theme: t.id,
                            backgroundColor: THEME_COLORS[t.id]?.bgColor || t.color,
                            backgroundImage: "",
                          };
                          setS(next);
                          applySettingsNow(next);
                        }}
                        style={{
                          display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "10px 6px", borderRadius: "9px", cursor: "pointer",
                          background: active ? `${C.accentDim}40` : C.surface,
                          border: `1px solid ${active ? C.borderFocus : C.border}`,
                          transition: "all 0.15s",
                        }}
                      >
                        <div style={{ width: "24px", height: "24px", borderRadius: "6px", background: t.color, border: `1px solid ${C.border}` }} />
                        <span style={{ fontSize: "9px", fontWeight: 500, color: active ? C.accent : C.textSub }}>{t.label}</span>
                      </button>
                    );
                  })}
                </div>

                <Divider />

                <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "14px 0 10px" }}>Background</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px", color: C.textMuted }}>Color</label>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ position: "relative", width: "36px", height: "36px", borderRadius: "8px", overflow: "hidden", border: `1px solid ${C.border}`, flexShrink: 0 }}>
                        <input
                          type="color"
                          value={/^#[0-9a-fA-F]{6}$/.test(s.backgroundColor || "") ? s.backgroundColor : "#020810"}
                          onChange={e => {
                            const next = { ...s, backgroundColor: e.target.value, backgroundImage: "" };
                            setS(next);
                            applySettingsNow(next);
                          }}
                          style={{ position: "absolute", inset: "-4px", width: "calc(100% + 8px)", height: "calc(100% + 8px)", cursor: "pointer", border: "none", padding: 0 }}
                        />
                      </div>
                      <input
                        type="text"
                        value={s.backgroundColor || "#020810"}
                        onChange={e => setVal("backgroundColor", e.target.value)}
                        onBlur={() => {
                          const next = { ...s, backgroundImage: "" };
                          applySettingsNow(next);
                        }}
                        style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", color: C.text, fontSize: "12px", padding: "8px 10px", outline: "none", fontFamily: "monospace" }}
                      />
                      <button
                        onClick={() => {
                          const next = { ...s, backgroundColor: "#020810", backgroundImage: "", theme: "default" };
                          setS(next);
                          applySettingsNow(next);
                        }}
                        style={{
                          padding: "8px 10px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`,
                          color: C.textSub, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap",
                        }}
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px", color: C.textMuted }}>Custom image</label>
                    <input ref={bgImgRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                      const file = e.target.files?.[0]; if (!file) return;
                      const reader = new FileReader();
                      reader.onload = ev => {
                        const next = { ...s, backgroundImage: ev.target?.result as string, backgroundColor: "" };
                        setS(next);
                        applySettingsNow(next);
                      };
                      reader.readAsDataURL(file);
                      e.target.value = "";
                    }} />
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => bgImgRef.current?.click()} style={{
                        flex: 1, display: "flex", alignItems: "center", gap: "8px", padding: "9px 12px", borderRadius: "8px",
                        background: C.surface, border: `1px solid ${C.border}`, color: C.textSub, fontSize: "12px", cursor: "pointer",
                      }}>
                        <Image size={12} />
                        {s.backgroundImage ? "Change image" : "Upload image"}
                      </button>
                      {s.backgroundImage && (
                        <button onClick={() => {
                          const next = { ...s, backgroundImage: "", backgroundColor: s.backgroundColor || "#020810" };
                          setS(next);
                          applySettingsNow(next);
                        }} style={{
                          padding: "9px 12px", borderRadius: "8px", background: "transparent",
                          border: `1px solid hsl(0 60% 50% / 0.2)`, color: C.danger, fontSize: "11px", cursor: "pointer",
                        }}>
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      const on = s.bgNetwork !== "true";
                      const next = { ...s, bgNetwork: on ? "true" : "false" };
                      setS(next);
                      applySettingsNow(next);
                    }}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "12px 14px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                      background: C.surface, border: `1px solid ${s.bgNetwork === "true" ? C.borderFocus : C.border}`,
                    }}
                  >
                    <div>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: C.text }}>Network lines</p>
                      <p style={{ margin: "3px 0 0", fontSize: 10, color: C.textSub }}>
                        Optional white mesh overlay — off by default
                      </p>
                    </div>
                    <div style={{
                      width: 36, height: 20, borderRadius: 99, padding: 2, flexShrink: 0,
                      background: s.bgNetwork === "true" ? C.accent : C.elevated,
                      border: `1px solid ${C.border}`,
                      transition: "background 0.15s",
                    }}>
                      <div style={{
                        width: 14, height: 14, borderRadius: "50%", background: "#fff",
                        transform: s.bgNetwork === "true" ? "translateX(16px)" : "translateX(0)",
                        transition: "transform 0.15s",
                      }} />
                    </div>
                  </button>
                </div>

                <ApplyBtn saved={settingsSaved} onClick={applySettings} />
              </div>
            )}

            {section === "cloaking" && (
              <div style={{ maxWidth: "440px" }}>
                <h2 style={{ fontSize: "15px", fontWeight: 700, color: C.text, margin: "0 0 3px" }}>Cloaking</h2>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 20px" }}>Disguise the tab to look like another site</p>

                <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>Quick Presets</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "18px" }}>
                  {SITE_PRESETS.map(p => {
                    const active = s.siteTitle === p.label;
                    return (
                      <button key={p.id} onClick={() => { setVal("siteTitle", p.label); setVal("siteLogo", p.favicon); }}
                        style={{ display: "flex", alignItems: "center", gap: "7px", padding: "9px 11px", borderRadius: "8px", cursor: "pointer",
                          background: active ? `${C.accentDim}40` : C.surface,
                          border: `1px solid ${active ? C.borderFocus : C.border}`,
                          color: active ? C.accent : C.textSub, fontSize: "11px", transition: "all 0.15s" }}
                        onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = C.accentDim; }}
                        onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = C.border; }}>
                        <img src={p.favicon} style={{ width: "12px", height: "12px" }} alt=""
                          onError={e => ((e.target as HTMLImageElement).style.display = "none")} />
                        {p.label}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
                  <Field label="Custom tab title" value={s.siteTitle || ""} onChange={(e: any) => setVal("siteTitle", e.target.value)} placeholder="e.g. Google Classroom" />
                  <Field label="Custom favicon URL" value={s.siteLogo || ""} onChange={(e: any) => setVal("siteLogo", e.target.value)} placeholder="https://..." icon={Lock} />
                </div>

                <Divider />
                <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "14px 0 6px" }}>About:Blank</p>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 10px" }}>Open the site disguised inside an about:blank popup</p>
                <button onClick={openAboutBlank} style={{
                  display: "flex", alignItems: "center", gap: "8px", padding: "9px 16px", borderRadius: "8px", marginBottom: "18px",
                  background: C.accentDim, border: `1px solid ${C.borderFocus}`,
                  color: C.accent, fontSize: "12px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
                }}>
                  <ExternalLink size={12} />
                  Open in about:blank
                </button>

                <Divider />
                <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "14px 0 6px" }}>Panic Key</p>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 10px" }}>Press a key to instantly redirect the browser</p>
                <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: "10px", marginBottom: "4px" }}>
                  <Field label="Key" value={s.panicKey || ""} onChange={(e: any) => setVal("panicKey", e.target.value)} placeholder="q" maxLength={1} icon={KeyRound} />
                  <Field label="Redirect URL" value={s.panicUrl || ""} onChange={(e: any) => setVal("panicUrl", e.target.value)} placeholder="https://google.com" icon={Lock} />
                </div>
                <ApplyBtn saved={settingsSaved} onClick={applySettings} />
              </div>
            )}

            {section === "behavior" && (
              <div style={{ maxWidth: "420px" }}>
                <h2 style={{ fontSize: "15px", fontWeight: 700, color: C.text, margin: "0 0 3px" }}>Behavior</h2>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 20px" }}>Control how the browser behaves</p>
                <SectionCard>
                  <div style={{ borderBottom: `1px solid ${C.border}` }}>
                    <Toggle label="Exit warning" desc="Show a confirmation before closing the tab" checked={s.beforeUnload === "true"} onChange={() => toggle("beforeUnload")} />
                  </div>
                  <div style={{ borderBottom: `1px solid ${C.border}` }}>
                    <Toggle label="Autocloak" desc="Wrap the site in about:blank on load" checked={s.autocloak === "true"} onChange={() => {
                      const next = s.autocloak !== "true";
                      setVal("autocloak", next ? "true" : "false");
                      localStorage.setItem("autocloak", next ? "true" : "false");
                      if (next) openAboutBlank();
                    }} />
                  </div>
                  <div style={{ borderBottom: `1px solid ${C.border}` }}>
                    <Toggle label="Disable right click" desc="Block the browser context menu" checked={s.disableRightClick === "true"} onChange={() => toggle("disableRightClick")} />
                  </div>
                  <Toggle label="Disable particles" desc="Remove background animations on new tab" checked={s.disableParticles === "true"} onChange={() => toggle("disableParticles")} />
                </SectionCard>
                <Divider />
                <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "14px 0 6px" }}>About:Blank</p>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 10px" }}>Open the site disguised inside an about:blank popup</p>
                <button onClick={openAboutBlank} style={{
                  display: "flex", alignItems: "center", gap: "8px", padding: "9px 16px", borderRadius: "8px", marginBottom: "18px",
                  background: C.accentDim, border: `1px solid ${C.borderFocus}`,
                  color: C.accent, fontSize: "12px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
                }}>
                  <ExternalLink size={12} />
                  Open in about:blank
                </button>
                <ApplyBtn saved={settingsSaved} onClick={applySettings} />
              </div>
            )}

            {section === "data" && (
              <div style={{ maxWidth: "400px" }}>
                <h2 style={{ fontSize: "15px", fontWeight: 700, color: C.text, margin: "0 0 3px" }}>Data</h2>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 20px" }}>Import, export, or reset your local data</p>

                <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>Account sync</p>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 10px" }}>
                  Themes, games, bookmarks, and other prefs sync when you are signed in.
                </p>
                <div style={{ display: "flex", gap: "6px", marginBottom: syncNote ? "8px" : "16px", flexWrap: "wrap" }}>
                  <button disabled={syncBusy} onClick={() => runManualSync("pull")} style={{
                    flex: 1, minWidth: "120px", padding: "9px 12px", borderRadius: "8px",
                    background: C.surface, border: `1px solid ${C.border}`, color: C.text,
                    fontSize: "11px", fontWeight: 600, cursor: syncBusy ? "wait" : "pointer", opacity: syncBusy ? 0.6 : 1,
                  }}>
                    {syncBusy ? "Working…" : "Download"}
                  </button>
                  <button disabled={syncBusy} onClick={() => runManualSync("push")} style={{
                    flex: 1, minWidth: "120px", padding: "9px 12px", borderRadius: "8px",
                    background: C.accentDim, border: `1px solid ${C.borderFocus}`, color: C.accent,
                    fontSize: "11px", fontWeight: 600, cursor: syncBusy ? "wait" : "pointer", opacity: syncBusy ? 0.6 : 1,
                  }}>
                    Upload
                  </button>
                </div>
                {syncNote && (
                  <p style={{ fontSize: "11px", color: C.success, margin: "0 0 14px" }}>{syncNote}</p>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {[
                    { label: "Export Data", desc: "Download settings as JSON", icon: Download, onClick: exportData },
                  ].map(item => (
                    <button key={item.label} onClick={item.onClick} style={{
                      display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", borderRadius: "9px",
                      background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer", width: "100%", transition: "border-color 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = C.borderFocus)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
                      <item.icon size={13} style={{ color: C.accent }} />
                      <div style={{ textAlign: "left" }}>
                        <p style={{ fontSize: "12px", fontWeight: 500, color: C.text, margin: 0 }}>{item.label}</p>
                        <p style={{ fontSize: "10px", color: C.textSub, margin: 0 }}>{item.desc}</p>
                      </div>
                    </button>
                  ))}

                  <label style={{
                    display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", borderRadius: "9px",
                    background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer", transition: "border-color 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = C.borderFocus)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
                    <Upload size={13} style={{ color: C.accent }} />
                    <div>
                      <p style={{ fontSize: "12px", fontWeight: 500, color: C.text, margin: 0 }}>Import Data</p>
                      <p style={{ fontSize: "10px", color: C.textSub, margin: 0 }}>Restore settings from a JSON file</p>
                    </div>
                    <input type="file" accept=".json" style={{ display: "none" }} onChange={importData} />
                  </label>

                  <Divider />

                  <button onClick={resetData} style={{
                    display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", borderRadius: "9px",
                    background: "transparent", border: `1px solid hsl(0 60% 50% / 0.15)`, cursor: "pointer", width: "100%", transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "hsl(0 60% 50% / 0.07)"; e.currentTarget.style.borderColor = "hsl(0 60% 50% / 0.3)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "hsl(0 60% 50% / 0.15)"; }}>
                    <Trash2 size={13} style={{ color: C.danger }} />
                    <div style={{ textAlign: "left" }}>
                      <p style={{ fontSize: "12px", fontWeight: 500, color: C.danger, margin: 0 }}>Reset All Data</p>
                      <p style={{ fontSize: "10px", color: "hsl(0 60% 40%)", margin: 0 }}>Clear all local settings — cannot be undone</p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {section === "admin" && isAdmin && (
              <div style={{ maxWidth: "600px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "3px" }}>
                  <h2 style={{ fontSize: "15px", fontWeight: 700, color: C.text, margin: 0 }}>Admin Panel</h2>
                  <span style={{ fontSize: "10px", fontWeight: 600, padding: "3px 8px", borderRadius: "6px", background: `${C.accentDim}40`, border: `1px solid ${C.borderFocus}`, color: C.accent }}>
                    {adminTab === "staff" ? `${staffList.length} team` : adminSearchActive ? `${adminUsers.length} results` : `${adminTotal} users`}
                  </span>
                </div>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 10px" }}>
                  {isOwner ? "Owner — manage team roles and users" : "Manage users and moderate content"}
                </p>
                <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
                  {(["users", "staff"] as const).map(tab => (
                    <button key={tab} onClick={() => setAdminTab(tab)} style={{
                      padding: "6px 12px", borderRadius: "7px", fontSize: "11px", fontWeight: 600, cursor: "pointer",
                      border: `1px solid ${adminTab === tab ? C.borderFocus : C.border}`,
                      background: adminTab === tab ? C.accentDim : C.surface,
                      color: adminTab === tab ? C.text : C.textMuted,
                    }}>
                      {tab === "users" ? "Users" : "Staff"}
                    </button>
                  ))}
                </div>
                {adminTab === "staff" ? (
                  staffLoading ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
                      <Loader2 size={18} className="animate-spin" style={{ color: C.accent }} />
                    </div>
                  ) : staffList.length === 0 ? (
                    <p style={{ fontSize: "11px", color: C.textMuted, textAlign: "center", padding: "24px" }}>No team members yet</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginBottom: "16px" }}>
                      {staffList.map(u => (
                        <div key={u.id} onClick={() => openUserDetail(u.id)} style={{
                          display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "9px",
                          background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer",
                        }}>
                          <div style={{
                            width: "32px", height: "32px", borderRadius: "9px", flexShrink: 0,
                            background: C.accentDim, border: `1px solid ${C.border}`,
                            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, color: C.accent,
                          }}>
                            {(u.username || "?")[0].toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "12px", fontWeight: 600, color: C.text }}>{u.username || "No username"}</span>
                              <span style={{ fontSize: "8px", fontWeight: 700, padding: "1px 4px", borderRadius: "4px",
                                background: `${roleColor(u.is_admin ?? 0, u.is_owner)}18`, color: roleColor(u.is_admin ?? 0, u.is_owner), border: `1px solid ${roleColor(u.is_admin ?? 0, u.is_owner)}30` }}>
                                {roleLabel(u.is_admin ?? 0, u.is_owner)}
                              </span>
                              {u.banned ? <span style={{ fontSize: "8px", padding: "1px 4px", borderRadius: "4px", background: "hsl(0 60% 50% / 0.1)", color: C.danger }}>Banned</span> : null}
                            </div>
                            {u.ip && <p style={{ fontSize: "10px", color: C.textMuted, margin: "2px 0 0" }}>IP: {u.ip}</p>}
                          </div>
                          {isOwner && u.id !== user.id && !u.is_owner && (
                            <div style={{ display: "flex", gap: "3px", flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                              {(u.is_admin ?? 0) < 1 && (
                                <button title="Promote to Mod" onClick={() => adminAction(u.id, "promote_mod")} style={iconBtn}>
                                  <Shield size={11} style={{ color: "hsl(165 50% 52%)" }} />
                                </button>
                              )}
                              {(u.is_admin ?? 0) < 2 && (
                                <button title="Promote to Staff" onClick={() => adminAction(u.id, "staff")} style={iconBtn}>
                                  <Users size={11} style={{ color: "hsl(270 55% 65%)" }} />
                                </button>
                              )}
                              {(u.is_admin ?? 0) < 3 && (
                                <button title="Promote to Admin" onClick={() => adminAction(u.id, "promote_admin")} style={iconBtn}>
                                  <ShieldCheck size={11} style={{ color: C.accent }} />
                                </button>
                              )}
                              {(u.is_admin ?? 0) >= 1 && (
                                <button title="Remove role" onClick={() => adminAction(u.id, "demote_admin")} style={iconBtn}>
                                  <ShieldOff size={11} style={{ color: "hsl(38 75% 58%)" }} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                <>
                <input
                  value={adminSearch} onChange={e => {
                    const v = e.target.value;
                    setAdminSearch(v);
                    if (!v.trim() && adminSearchActive) loadAdminUsers(1);
                  }} placeholder="Search by name or email..."
                  style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", color: C.text, fontSize: "12px", padding: "8px 12px", outline: "none", fontFamily: "inherit", boxSizing: "border-box", marginBottom: "16px", transition: "border-color 0.15s" }}
                  onFocus={e => (e.currentTarget.style.borderColor = C.borderFocus)}
                  onBlur={e => (e.currentTarget.style.borderColor = C.border)}
                />
                {adminLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
                    <Loader2 size={18} className="animate-spin" style={{ color: C.accent }} />
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                    {adminUsers.map(u => (
                      <div key={u.id} onClick={() => openUserDetail(u.id)} style={{
                        display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "9px",
                        background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer",
                      }}>
                        <div style={{
                          width: "32px", height: "32px", borderRadius: "9px", flexShrink: 0, overflow: "hidden",
                          background: C.accentDim, border: `1px solid ${C.border}`,
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, color: C.accent,
                        }}>
                          {(u.username || "?")[0].toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                            <span style={{ fontSize: "12px", fontWeight: 600, color: C.text }}>{u.username || "No username"}</span>
                            <span style={{ fontSize: "8px", fontWeight: 700, padding: "1px 4px", borderRadius: "4px",
                              background: `${roleColor(u.is_admin ?? 0, u.is_owner)}18`, color: roleColor(u.is_admin ?? 0, u.is_owner), border: `1px solid ${roleColor(u.is_admin ?? 0, u.is_owner)}30` }}>
                              {roleLabel(u.is_admin ?? 0, u.is_owner)}
                            </span>
                            {u.banned ? <span style={{ fontSize: "8px", padding: "1px 4px", borderRadius: "4px", background: "hsl(0 60% 50% / 0.1)", color: C.danger, border: "1px solid hsl(0 60% 50% / 0.2)" }}>Banned</span> : null}
                          </div>
                          <p style={{ fontSize: "10px", color: C.textMuted, margin: "1px 0 0" }}>
                            {u.created_at ? new Date(u.created_at).toLocaleDateString() : ""}
                          </p>
                        </div>
                        {u.id !== user.id && !u.is_owner && (
                          <div style={{ display: "flex", gap: "3px", flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                            {isOwner && (u.is_admin ?? 0) < 1 && (
                              <button title="Promote to Mod" onClick={() => adminAction(u.id, "promote_mod")} style={iconBtn}>
                                <Shield size={11} style={{ color: "hsl(165 50% 52%)" }} />
                              </button>
                            )}
                            {isOwner && (u.is_admin ?? 0) < 2 && (
                              <button title="Promote to Staff" onClick={() => adminAction(u.id, "staff")} style={iconBtn}>
                                <Users size={11} style={{ color: "hsl(270 55% 65%)" }} />
                              </button>
                            )}
                            {isOwner && (u.is_admin ?? 0) < 3 && (
                              <button title="Promote to Admin" onClick={() => adminAction(u.id, "promote_admin")} style={iconBtn}>
                                <ShieldCheck size={11} style={{ color: C.accent }} />
                              </button>
                            )}
                            {isOwner && (u.is_admin ?? 0) >= 1 && (
                              <button title="Remove role" onClick={() => adminAction(u.id, "demote_admin")} style={iconBtn}>
                                <ShieldOff size={11} style={{ color: "hsl(38 75% 58%)" }} />
                              </button>
                            )}
                            {(u.email_verified ?? 1) === 1 && !u.banned && (
                              <button title="Suspend" onClick={() => adminAction(u.id, "suspend")} style={iconBtn}>
                                <UserMinus size={11} style={{ color: "hsl(38 75% 58%)" }} />
                              </button>
                            )}
                            {!u.banned ? (
                              <button title="Ban user + IP" onClick={() => adminAction(u.id, "ban")} style={iconBtn}>
                                <Ban size={11} style={{ color: C.danger }} />
                              </button>
                            ) : (
                              <button title="Unban" onClick={() => adminAction(u.id, "unban")} style={iconBtn}>
                                <Check size={11} style={{ color: "hsl(145 50% 55%)" }} />
                              </button>
                            )}
                            <button title="Delete user" onClick={() => { if (confirm(`Delete ${u.username || "this user"}?`)) adminAction(u.id, "delete"); }} style={iconBtn}>
                              <Trash2 size={11} style={{ color: C.danger }} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {adminTab === "users" && !adminSearchActive && adminTotalPages > 1 && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginTop: "14px" }}>
                    <button disabled={adminPage <= 1 || adminLoading} onClick={() => loadAdminUsers(adminPage - 1)}
                      style={{ padding: "6px 14px", borderRadius: "7px", border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: "11px", cursor: adminPage <= 1 ? "not-allowed" : "pointer", opacity: adminPage <= 1 ? 0.4 : 1 }}>
                      Previous
                    </button>
                    <span style={{ fontSize: "10px", color: C.textMuted }}>{adminPage} / {adminTotalPages}</span>
                    <button disabled={adminPage >= adminTotalPages || adminLoading} onClick={() => loadAdminUsers(adminPage + 1)}
                      style={{ padding: "6px 14px", borderRadius: "7px", border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: "11px", cursor: adminPage >= adminTotalPages ? "not-allowed" : "pointer", opacity: adminPage >= adminTotalPages ? 0.4 : 1 }}>
                      Next
                    </button>
                  </div>
                )}
                </>
                )}
                <AnimatePresence>
                  {(selectedUser || detailLoading) && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      onClick={() => !detailLoading && setSelectedUser(null)}
                      style={{ position: "fixed", inset: 0, background: "hsla(216, 50%, 4%, 0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
                      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                        onClick={e => e.stopPropagation()}
                        style={{ width: "100%", maxWidth: "380px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "20px" }}>
                        {detailLoading ? (
                          <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}>
                            <Loader2 size={20} className="animate-spin" style={{ color: C.accent }} />
                          </div>
                        ) : selectedUser && (
                          <>
                            <h3 style={{ fontSize: "14px", fontWeight: 700, color: C.text, margin: "0 0 14px" }}>User Details</h3>
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "11px" }}>
                              {[
                                ["Email", selectedUser.email],
                                ["Username", selectedUser.username || "—"],
                                ["Role", roleLabel(selectedUser.is_admin ?? 0, selectedUser.is_owner)],
                                ["Verified", selectedUser.email_verified ? "Yes" : "No"],
                                ["Banned", selectedUser.banned ? "Yes" : "No"],
                                ["IP", selectedUser.ip || "—"],
                                ["School", selectedUser.school || "—"],
                                ["Age", selectedUser.age != null ? String(selectedUser.age) : "—"],
                                ["Bio", selectedUser.bio || "—"],
                                ["Joined", selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleString() : "—"],
                                ["ID", selectedUser.id],
                              ].map(([label, val]) => (
                                <div key={label} style={{ display: "flex", gap: "8px" }}>
                                  <span style={{ color: C.textMuted, minWidth: "64px", flexShrink: 0 }}>{label}</span>
                                  <span style={{ color: C.text, wordBreak: "break-all" }}>{val}</span>
                                </div>
                              ))}
                            </div>
                            <button onClick={() => setSelectedUser(null)}
                              style={{ marginTop: "16px", width: "100%", padding: "8px", borderRadius: "8px", border: `1px solid ${C.border}`, background: C.elevated, color: C.text, fontSize: "12px", cursor: "pointer" }}>
                              Close
                            </button>
                          </>
                        )}
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {section === "live" && isAdmin && (
              <div style={{ maxWidth: "620px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Live Sites</h2>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: `${C.accentDim}40`, border: `1px solid ${C.borderFocus}`, color: C.accent }}>
                    {liveClients} online · {liveUnique} unique
                  </span>
                </div>
                <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 14px" }}>
                  Aggregated proxied URLs by active viewers — top {liveSites.length || 250}, live refresh
                </p>
                {liveLoading && liveSites.length === 0 ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                    <Loader2 size={18} className="animate-spin" style={{ color: C.accent }} />
                  </div>
                ) : liveSites.length === 0 ? (
                  <p style={{ fontSize: 12, color: C.textMuted, textAlign: "center", padding: 28 }}>No active proxied sites right now</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: "70vh", overflowY: "auto" }}>
                    {liveSites.map((site) => (
                      <div key={site.url} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 9,
                        background: C.surface, border: `1px solid ${C.border}`,
                      }}>
                        <Globe2 size={12} style={{ color: C.accent, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {site.url}
                          </p>
                          <p style={{ margin: "2px 0 0", fontSize: 10, color: C.textMuted }}>
                            {site.viewers || 1} viewer{(site.viewers || 1) === 1 ? "" : "s"}
                            {site.username ? ` · @${site.username}` : ""}
                            {" · "}
                            {Math.max(0, Math.round((Date.now() - site.updatedAt) / 1000))}s ago
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {section === "firefox-vm" && isAdmin && (
              <div style={{ maxWidth: "620px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <Monitor size={14} style={{ color: C.accent }} />
                    Firefox VM
                  </h2>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: `${C.accentDim}40`, border: `1px solid ${C.borderFocus}`, color: C.accent }}>
                    {ffLiveCount} active
                  </span>
                </div>
                <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 14px" }}>
                  Live sessions (heartbeat) · history searchable by day
                </p>
                {ffLive.length === 0 ? (
                  <p style={{ fontSize: 12, color: C.textMuted, margin: "0 0 14px" }}>No active Firefox VM sessions</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: "28vh", overflowY: "auto", marginBottom: 14 }}>
                    {ffLive.map((s) => (
                      <div key={s.sessionId} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 9,
                        background: C.surface, border: `1px solid ${C.border}`,
                      }}>
                        <Monitor size={12} style={{ color: C.accent, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 12, color: C.text }}>
                            {s.username ? `@${s.username}` : s.userId.slice(0, 8)}
                          </p>
                          <p style={{ margin: "2px 0 0", fontSize: 10, color: C.textMuted }}>
                            opened {new Date(s.startedAt).toLocaleString()} · last seen {Math.max(0, Math.round((Date.now() - s.lastSeen) / 1000))}s ago
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, alignItems: "center" }}>
                  <input
                    type="date"
                    value={ffDay}
                    onChange={(e) => setFfDay(e.target.value)}
                    style={{
                      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                      color: C.text, fontSize: 12, padding: "7px 10px", outline: "none",
                    }}
                  />
                  <input
                    value={ffQuery}
                    onChange={(e) => setFfQuery(e.target.value)}
                    placeholder="Search user / id"
                    style={{
                      flex: 1, minWidth: 120, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                      color: C.text, fontSize: 12, padding: "7px 10px", outline: "none",
                    }}
                  />
                  <button
                    onClick={loadFfHistory}
                    disabled={ffHistoryLoading}
                    style={{
                      padding: "7px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
                      border: `1px solid ${C.borderFocus}`, background: C.accentDim, color: C.accent,
                      opacity: ffHistoryLoading ? 0.6 : 1,
                    }}
                  >
                    {ffHistoryLoading ? "…" : "Search"}
                  </button>
                </div>
                <p style={{ fontSize: 10, color: C.textMuted, margin: "0 0 8px" }}>
                  {ffHistoryTotal} session{ffHistoryTotal === 1 ? "" : "s"} on {ffDay}
                </p>
                {ffHistory.length === 0 ? (
                  <p style={{ fontSize: 12, color: C.textMuted }}>No sessions for this day</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: "42vh", overflowY: "auto" }}>
                    {ffHistory.map((s) => (
                      <div key={s.sessionId} style={{
                        padding: "9px 12px", borderRadius: 9, background: C.surface, border: `1px solid ${C.border}`,
                      }}>
                        <p style={{ margin: 0, fontSize: 12, color: C.text }}>
                          {s.username ? `@${s.username}` : s.userId.slice(0, 8)}
                          {s.active ? (
                            <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, color: C.success }}>LIVE</span>
                          ) : null}
                        </p>
                        <p style={{ margin: "2px 0 0", fontSize: 10, color: C.textMuted }}>
                          {new Date(s.startedAt).toLocaleString()}
                          {" → "}
                          {s.endedAt ? new Date(s.endedAt).toLocaleString() : "open"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {section === "link-stats" && isAdmin && (
              <div style={{ maxWidth: "680px" }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 3px", display: "flex", alignItems: "center", gap: 8 }}>
                  <BarChart3 size={14} style={{ color: C.accent }} />
                  Link Stats
                </h2>
                <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 16px" }}>
                  Distribution across blockers · refreshes every 15s
                </p>
                {linkStatsLoading && !linkStats ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                    <Loader2 size={18} className="animate-spin" style={{ color: C.accent }} />
                  </div>
                ) : !linkStats ? (
                  <p style={{ fontSize: 12, color: C.textMuted }}>Could not load stats</p>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 16 }}>
                      {[
                        ["Today", linkStats.totals?.today],
                        ["This week", linkStats.totals?.thisWeek],
                        ["Last week", linkStats.totals?.lastWeek],
                        ["All time", linkStats.totals?.allTime],
                        ["Users (week)", linkStats.uniqueUsers?.thisWeek],
                        ["At weekly limit", linkStats.usersAtWeeklyLimit],
                      ].map(([label, val]) => (
                        <div key={String(label)} style={{
                          padding: "12px 14px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`,
                        }}>
                          <p style={{ margin: 0, fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
                          <p style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 700, color: C.text }}>{val ?? 0}</p>
                        </div>
                      ))}
                    </div>

                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
                      Per blocker (this week)
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16, maxHeight: "28vh", overflowY: "auto" }}>
                      {Object.entries(linkStats.perBlocker?.week || {}).map(([blocker, count]) => (
                        <div key={blocker} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "8px 12px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`,
                        }}>
                          <span style={{ fontSize: 12, color: C.text }}>{String(blocker).replace(/_/g, " ")}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>{count as number}</span>
                        </div>
                      ))}
                    </div>

                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
                      Pool sizes
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 6, marginBottom: 16 }}>
                      {Object.entries(linkStats.poolSizes || {}).map(([blocker, size]) => (
                        <div key={blocker} style={{
                          padding: "8px 10px", borderRadius: 8, background: C.elevated, border: `1px solid ${C.border}`,
                          display: "flex", justifyContent: "space-between", gap: 8,
                        }}>
                          <span style={{ fontSize: 10, color: C.textSub }}>{String(blocker).replace(/_/g, " ")}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{size as number}</span>
                        </div>
                      ))}
                    </div>

                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
                      Top users this week
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
                      {(linkStats.topUsersWeek || []).length === 0 ? (
                        <p style={{ fontSize: 12, color: C.textMuted }}>None yet</p>
                      ) : (
                        (linkStats.topUsersWeek || []).map((u: any) => (
                          <div key={u.userId} style={{
                            display: "flex", justifyContent: "space-between", padding: "8px 12px", borderRadius: 8,
                            background: C.surface, border: `1px solid ${C.border}`, fontSize: 12,
                          }}>
                            <span style={{ color: C.text }}>{u.username ? `@${u.username}` : (u.email || u.userId.slice(0, 8))}</span>
                            <span style={{ color: C.accent, fontWeight: 700 }}>{u.count}</span>
                          </div>
                        ))
                      )}
                    </div>

                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
                      Recent claims
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: "32vh", overflowY: "auto" }}>
                      {(linkStats.recent || []).map((r: any) => (
                        <div key={r.id} style={{
                          padding: "8px 12px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`,
                        }}>
                          <p style={{ margin: 0, fontSize: 11, color: C.text, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.link}
                          </p>
                          <p style={{ margin: "2px 0 0", fontSize: 10, color: C.textMuted }}>
                            {r.blocker?.replace(/_/g, " ")} · {r.username ? `@${r.username}` : r.userId?.slice(0, 8)} · {new Date(r.claimedAt).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {section === "updates" && isAdmin && (
              <div style={{ maxWidth: "520px" }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 3px" }}>Global Update</h2>
                <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 16px" }}>
                  Post a one-time popup announcement. Suspend anytime to hide it for new visitors.
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
                  <Field label="Title" value={annTitle} onChange={(e: any) => setAnnTitle(e.target.value)} placeholder="What's new" maxLength={120} icon={Megaphone} />
                  <div>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6, color: C.textMuted }}>Message</label>
                    <textarea
                      value={annContent}
                      onChange={(e) => setAnnContent(e.target.value)}
                      placeholder="Announcement content…"
                      maxLength={4000}
                      rows={4}
                      style={{
                        width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                        color: C.text, fontSize: 13, padding: "9px 12px", outline: "none", resize: "vertical",
                        fontFamily: "inherit", boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button onClick={createAnnouncement} disabled={annBusy} style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8,
                      background: C.accentDim, border: `1px solid ${C.borderFocus}`, color: C.accent,
                      fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: annBusy ? 0.6 : 1,
                    }}>
                      {annBusy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                      Publish
                    </button>
                    {annMsg && <span style={{ fontSize: 11, color: C.success }}>{annMsg}</span>}
                  </div>
                </div>

                <Divider />
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "14px 0 10px" }}>
                  Posts
                </p>
                {announcements.length === 0 ? (
                  <p style={{ fontSize: 12, color: C.textMuted }}>No announcements yet</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {announcements.map((a) => (
                      <div key={a.id} style={{
                        padding: "12px 14px", borderRadius: 9, background: C.surface, border: `1px solid ${C.border}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ flex: 1, fontSize: 12, fontWeight: 650, color: C.text }}>{a.title}</span>
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 5,
                            background: a.active ? "hsl(145 50% 40% / 0.15)" : "hsl(0 0% 40% / 0.15)",
                            color: a.active ? C.success : C.textMuted,
                          }}>
                            {a.active ? "Active" : "Suspended"}
                          </span>
                        </div>
                        <p style={{ margin: "0 0 10px", fontSize: 11, color: C.textSub, whiteSpace: "pre-wrap" }}>{a.content}</p>
                        <button
                          onClick={() => toggleAnnouncement(a.id, !a.active)}
                          style={{
                            padding: "6px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer",
                            border: `1px solid ${C.border}`, background: C.elevated, color: C.textSub,
                          }}
                        >
                          {a.active ? "Suspend" : "Reactivate"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: "26px", height: "26px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center",
  background: C.elevated, border: `1px solid ${C.border}`, cursor: "pointer", transition: "border-color 0.15s",
};