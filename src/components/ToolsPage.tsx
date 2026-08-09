import { useState, type CSSProperties, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wrench, KeyRound, Binary, Hash, Fingerprint, Braces, Link2, Palette, Type,
  Clock, AlignLeft, CaseSensitive, Diff, Regex, Calculator, FileJson, Code2,
  Dices, Timer, ArrowLeft, Copy, Check, ChevronRight, Slash,
} from "lucide-react";

const S = {
  surface: "hsl(216 26% 9%)",
  elevated: "hsl(216 22% 12%)",
  border: "hsl(216 20% 16%)",
  borderFocus: "hsl(213 60% 40%)",
  accent: "hsl(213 70% 58%)",
  accentDim: "hsl(213 50% 40% / 0.3)",
  text: "hsl(0 0% 96%)",
  textSub: "hsl(216 15% 55%)",
  textMuted: "hsl(216 12% 40%)",
  success: "hsl(145 50% 50%)",
  danger: "hsl(0 60% 56%)",
};

type Cat = "All" | "Generators" | "Encoders" | "Converters" | "Utilities";
type ToolId =
  | "password" | "base64" | "hash" | "uuid" | "json" | "url" | "color" | "lorem"
  | "timestamp" | "counter" | "case" | "slugify" | "diff" | "regex" | "baseconv"
  | "jwt" | "html" | "random" | "cron";

interface ToolMeta {
  id: ToolId;
  name: string;
  desc: string;
  cat: Exclude<Cat, "All">;
  icon: typeof Wrench;
}

const TOOLS: ToolMeta[] = [
  { id: "password", name: "Password Generator", desc: "Secure random passwords", cat: "Generators", icon: KeyRound },
  { id: "uuid", name: "UUID Generator", desc: "Generate UUIDs in bulk", cat: "Generators", icon: Fingerprint },
  { id: "lorem", name: "Lorem Ipsum", desc: "Placeholder text generator", cat: "Generators", icon: Type },
  { id: "random", name: "Random Number", desc: "Inclusive range RNG", cat: "Generators", icon: Dices },
  { id: "slugify", name: "Slugify", desc: "URL-friendly slugs", cat: "Generators", icon: Slash },
  { id: "base64", name: "Base64", desc: "Encode and decode Base64", cat: "Encoders", icon: Binary },
  { id: "url", name: "URL Encode/Decode", desc: "Percent-encoding helpers", cat: "Encoders", icon: Link2 },
  { id: "html", name: "HTML Entities", desc: "Encode and decode entities", cat: "Encoders", icon: Code2 },
  { id: "jwt", name: "JWT Decoder", desc: "Decode header & payload", cat: "Encoders", icon: FileJson },
  { id: "hash", name: "Hash Generator", desc: "MD5 & SHA digests", cat: "Converters", icon: Hash },
  { id: "color", name: "Color Converter", desc: "Hex, RGB, and HSL", cat: "Converters", icon: Palette },
  { id: "timestamp", name: "Timestamp Converter", desc: "Unix ↔ date", cat: "Converters", icon: Clock },
  { id: "case", name: "Case Converter", desc: "Upper, camel, snake…", cat: "Converters", icon: CaseSensitive },
  { id: "baseconv", name: "Number Base", desc: "Bin / Oct / Dec / Hex", cat: "Converters", icon: Calculator },
  { id: "json", name: "JSON Formatter", desc: "Format, validate, minify", cat: "Utilities", icon: Braces },
  { id: "counter", name: "Word Counter", desc: "Words, chars, lines", cat: "Utilities", icon: AlignLeft },
  { id: "diff", name: "Diff Checker", desc: "Compare two texts", cat: "Utilities", icon: Diff },
  { id: "regex", name: "Regex Tester", desc: "Test patterns live", cat: "Utilities", icon: Regex },
  { id: "cron", name: "Cron Explainer", desc: "Basic cron breakdown", cat: "Utilities", icon: Timer },
];

const CATS: Cat[] = ["All", "Generators", "Encoders", "Converters", "Utilities"];

const LOREM = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";

function copyText(text: string) {
  try { void navigator.clipboard.writeText(text); } catch {}
}

function CopyBtn({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { copyText(value); setOk(true); setTimeout(() => setOk(false), 1200); }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
      style={{ background: S.elevated, border: `1px solid ${S.border}`, color: ok ? S.success : S.textSub }}
    >
      {ok ? <Check size={12} /> : <Copy size={12} />}
      {ok ? "Copied" : "Copy"}
    </button>
  );
}

function fieldStyle(): CSSProperties {
  return {
    background: S.elevated,
    border: `1px solid ${S.border}`,
    color: S.text,
    borderRadius: 12,
    outline: "none",
    width: "100%",
    padding: "10px 12px",
    fontSize: 13,
  };
}

function btnStyle(primary?: boolean): CSSProperties {
  return {
    background: primary ? S.accent : S.elevated,
    border: `1px solid ${primary ? "transparent" : S.border}`,
    color: primary ? "#fff" : S.text,
    borderRadius: 12,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  };
}

function label(t: string) {
  return <p className="text-[11px] mb-1.5" style={{ color: S.textMuted }}>{t}</p>;
}

function ToolShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: S.surface, border: `1px solid ${S.border}` }}>
      <h3 className="text-sm font-medium" style={{ color: S.text }}>{title}</h3>
      {children}
    </div>
  );
}

function md5(str: string): string {
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    a = (a + q + x + t) | 0;
    return (((a << s) | (a >>> (32 - s))) + b) | 0;
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
  }
  function toUtf8(s: string) {
    return unescape(encodeURIComponent(s));
  }
  const msg = toUtf8(str);
  const n = msg.length;
  const words: number[] = [];
  for (let i = 0; i < n; i++) words[i >> 2] |= msg.charCodeAt(i) << ((i % 4) * 8);
  words[n >> 2] |= 0x80 << ((n % 4) * 8);
  const bitLen = n * 8;
  words[(((bitLen + 64) >>> 9) << 4) + 14] = bitLen;
  let a0 = 1732584193, b0 = -271733879, c0 = -1732584194, d0 = 271733878;
  for (let i = 0; i < words.length; i += 16) {
    let a = a0, b = b0, c = c0, d = d0;
    a = ff(a, b, c, d, words[i], 7, -680876936); d = ff(d, a, b, c, words[i + 1], 12, -389564586);
    c = ff(c, d, a, b, words[i + 2], 17, 606105819); b = ff(b, c, d, a, words[i + 3], 22, -1044525330);
    a = ff(a, b, c, d, words[i + 4], 7, -176418897); d = ff(d, a, b, c, words[i + 5], 12, 1200080426);
    c = ff(c, d, a, b, words[i + 6], 17, -1473231341); b = ff(b, c, d, a, words[i + 7], 22, -45705983);
    a = ff(a, b, c, d, words[i + 8], 7, 1770035416); d = ff(d, a, b, c, words[i + 9], 12, -1958414417);
    c = ff(c, d, a, b, words[i + 10], 17, -42063); b = ff(b, c, d, a, words[i + 11], 22, -1990404162);
    a = ff(a, b, c, d, words[i + 12], 7, 1804603682); d = ff(d, a, b, c, words[i + 13], 12, -40341101);
    c = ff(c, d, a, b, words[i + 14], 17, -1502002290); b = ff(b, c, d, a, words[i + 15], 22, 1236535329);
    a = gg(a, b, c, d, words[i + 1], 5, -165796510); d = gg(d, a, b, c, words[i + 6], 9, -1069501632);
    c = gg(c, d, a, b, words[i + 11], 14, 643717713); b = gg(b, c, d, a, words[i], 20, -373897302);
    a = gg(a, b, c, d, words[i + 5], 5, -701558691); d = gg(d, a, b, c, words[i + 10], 9, 38016083);
    c = gg(c, d, a, b, words[i + 15], 14, -660478335); b = gg(b, c, d, a, words[i + 4], 20, -405537848);
    a = gg(a, b, c, d, words[i + 9], 5, 568446438); d = gg(d, a, b, c, words[i + 14], 9, -1019803690);
    c = gg(c, d, a, b, words[i + 3], 14, -187363961); b = gg(b, c, d, a, words[i + 8], 20, 1163531501);
    a = gg(a, b, c, d, words[i + 13], 5, -1444681467); d = gg(d, a, b, c, words[i + 2], 9, -51403784);
    c = gg(c, d, a, b, words[i + 7], 14, 1735328473); b = gg(b, c, d, a, words[i + 12], 20, -1926607734);
    a = hh(a, b, c, d, words[i + 5], 4, -378558); d = hh(d, a, b, c, words[i + 8], 11, -2022574463);
    c = hh(c, d, a, b, words[i + 11], 16, 1839030562); b = hh(b, c, d, a, words[i + 14], 23, -35309556);
    a = hh(a, b, c, d, words[i + 1], 4, -1530992060); d = hh(d, a, b, c, words[i + 4], 11, 1272893353);
    c = hh(c, d, a, b, words[i + 7], 16, -155497632); b = hh(b, c, d, a, words[i + 10], 23, -1094730640);
    a = hh(a, b, c, d, words[i + 13], 4, 681279174); d = hh(d, a, b, c, words[i], 11, -358537222);
    c = hh(c, d, a, b, words[i + 3], 16, -722521979); b = hh(b, c, d, a, words[i + 6], 23, 76029189);
    a = hh(a, b, c, d, words[i + 9], 4, -640364487); d = hh(d, a, b, c, words[i + 12], 11, -421815835);
    c = hh(c, d, a, b, words[i + 15], 16, 530742520); b = hh(b, c, d, a, words[i + 2], 23, -995338651);
    a = ii(a, b, c, d, words[i], 6, -198630844); d = ii(d, a, b, c, words[i + 7], 10, 1126891415);
    c = ii(c, d, a, b, words[i + 14], 15, -1416354905); b = ii(b, c, d, a, words[i + 5], 21, -57434055);
    a = ii(a, b, c, d, words[i + 12], 6, 1700485571); d = ii(d, a, b, c, words[i + 3], 10, -1894986606);
    c = ii(c, d, a, b, words[i + 10], 15, -1051523); b = ii(b, c, d, a, words[i + 1], 21, -2054922799);
    a = ii(a, b, c, d, words[i + 8], 6, 1873313359); d = ii(d, a, b, c, words[i + 15], 10, -30611744);
    c = ii(c, d, a, b, words[i + 6], 15, -1560198380); b = ii(b, c, d, a, words[i + 13], 21, 1309151649);
    a = ii(a, b, c, d, words[i + 4], 6, -145523070); d = ii(d, a, b, c, words[i + 11], 10, -1120210379);
    c = ii(c, d, a, b, words[i + 2], 15, 718787259); b = ii(b, c, d, a, words[i + 9], 21, -343485551);
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
  }
  function hex(n: number) {
    let s = "";
    for (let j = 0; j < 4; j++) s += ((n >> (j * 8)) & 0xff).toString(16).padStart(2, "0");
    return s;
  }
  return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}

async function shaHex(algo: string, text: string) {
  const buf = await crypto.subtle.digest(algo, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function PasswordTool() {
  const [len, setLen] = useState(16);
  const [upper, setUpper] = useState(true);
  const [lower, setLower] = useState(true);
  const [nums, setNums] = useState(true);
  const [syms, setSyms] = useState(true);
  const [out, setOut] = useState("");
  const gen = () => {
    let chars = "";
    if (upper) chars += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (lower) chars += "abcdefghijklmnopqrstuvwxyz";
    if (nums) chars += "0123456789";
    if (syms) chars += "!@#$%^&*()-_=+[]{};:,.<>?";
    if (!chars) return;
    const arr = new Uint32Array(len);
    crypto.getRandomValues(arr);
    setOut(Array.from(arr, (n) => chars[n % chars.length]).join(""));
  };
  const chk = (v: boolean, set: (b: boolean) => void, t: string) => (
    <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: S.textSub }}>
      <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /> {t}
    </label>
  );
  return (
    <ToolShell title="Password Generator">
      {label(`Length: ${len}`)}
      <input type="range" min={4} max={64} value={len} onChange={(e) => setLen(+e.target.value)} className="w-full" />
      <div className="flex flex-wrap gap-3">{chk(upper, setUpper, "Upper")}{chk(lower, setLower, "Lower")}{chk(nums, setNums, "Numbers")}{chk(syms, setSyms, "Symbols")}</div>
      <div className="flex gap-2"><button type="button" style={btnStyle(true)} onClick={gen}>Generate</button>{out && <CopyBtn value={out} />}</div>
      {out && <input readOnly value={out} style={fieldStyle()} />}
    </ToolShell>
  );
}

function Base64Tool() {
  const [inT, setInT] = useState("");
  const [out, setOut] = useState("");
  const [err, setErr] = useState("");
  const enc = () => { setErr(""); try { setOut(btoa(unescape(encodeURIComponent(inT)))); } catch { setErr("Encode failed"); } };
  const dec = () => { setErr(""); try { setOut(decodeURIComponent(escape(atob(inT)))); } catch { setErr("Invalid Base64"); } };
  return (
    <ToolShell title="Base64 Encode / Decode">
      <textarea rows={4} value={inT} onChange={(e) => setInT(e.target.value)} style={{ ...fieldStyle(), fontFamily: "ui-monospace, monospace", resize: "vertical" }} placeholder="Input…" />
      <div className="flex gap-2"><button type="button" style={btnStyle(true)} onClick={enc}>Encode</button><button type="button" style={btnStyle()} onClick={dec}>Decode</button>{out && <CopyBtn value={out} />}</div>
      {err && <p className="text-xs" style={{ color: S.danger }}>{err}</p>}
      <textarea rows={4} readOnly value={out} style={{ ...fieldStyle(), fontFamily: "ui-monospace, monospace", resize: "vertical" }} placeholder="Output…" />
    </ToolShell>
  );
}

function HashTool() {
  const [inT, setInT] = useState("");
  const [algo, setAlgo] = useState("SHA-256");
  const [out, setOut] = useState("");
  const run = async () => {
    if (algo === "MD5") setOut(md5(inT));
    else setOut(await shaHex(algo, inT));
  };
  return (
    <ToolShell title="Hash Generator">
      <textarea rows={3} value={inT} onChange={(e) => setInT(e.target.value)} style={{ ...fieldStyle(), fontFamily: "ui-monospace, monospace", resize: "vertical" }} placeholder="Text to hash…" />
      <div className="flex flex-wrap gap-2 items-center">
        {["MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512"].map((a) => (
          <button key={a} type="button" onClick={() => setAlgo(a)} className="px-2.5 py-1 rounded-lg text-xs" style={{ background: algo === a ? S.accentDim : S.elevated, border: `1px solid ${algo === a ? S.accent : S.border}`, color: S.text }}>{a}</button>
        ))}
      </div>
      <p className="text-[10px]" style={{ color: S.textMuted }}>{algo === "MD5" ? "MD5 via compact client-side implementation" : "SHA via Web Crypto"}</p>
      <div className="flex gap-2"><button type="button" style={btnStyle(true)} onClick={() => void run()}>Hash</button>{out && <CopyBtn value={out} />}</div>
      {out && <input readOnly value={out} style={{ ...fieldStyle(), fontFamily: "ui-monospace, monospace" }} />}
    </ToolShell>
  );
}

function UuidTool() {
  const [count, setCount] = useState(5);
  const [out, setOut] = useState("");
  const gen = () => setOut(Array.from({ length: Math.min(100, Math.max(1, count)) }, () => crypto.randomUUID()).join("\n"));
  return (
    <ToolShell title="UUID Generator">
      {label("Count")}
      <input type="number" min={1} max={100} value={count} onChange={(e) => setCount(+e.target.value)} style={fieldStyle()} />
      <div className="flex gap-2"><button type="button" style={btnStyle(true)} onClick={gen}>Generate</button>{out && <CopyBtn value={out} />}</div>
      <textarea rows={6} readOnly value={out} style={{ ...fieldStyle(), fontFamily: "ui-monospace, monospace", resize: "vertical" }} />
    </ToolShell>
  );
}

function JsonTool() {
  const [inT, setInT] = useState('{\n  "hello": "world"\n}');
  const [out, setOut] = useState("");
  const [msg, setMsg] = useState("");
  const run = (mode: "format" | "minify" | "validate") => {
    try {
      const v = JSON.parse(inT);
      if (mode === "validate") { setMsg("Valid JSON"); setOut(inT); return; }
      setMsg("OK");
      setOut(JSON.stringify(v, null, mode === "format" ? 2 : 0));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Invalid JSON");
      setOut("");
    }
  };
  return (
    <ToolShell title="JSON Formatter">
      <textarea rows={6} value={inT} onChange={(e) => setInT(e.target.value)} style={{ ...fieldStyle(), fontFamily: "ui-monospace, monospace", resize: "vertical" }} />
      <div className="flex flex-wrap gap-2">
        <button type="button" style={btnStyle(true)} onClick={() => run("format")}>Format</button>
        <button type="button" style={btnStyle()} onClick={() => run("minify")}>Minify</button>
        <button type="button" style={btnStyle()} onClick={() => run("validate")}>Validate</button>
        {out && <CopyBtn value={out} />}
      </div>
      {msg && <p className="text-xs" style={{ color: msg.startsWith("Valid") || msg === "OK" ? S.success : S.danger }}>{msg}</p>}
      <textarea rows={6} readOnly value={out} style={{ ...fieldStyle(), fontFamily: "ui-monospace, monospace", resize: "vertical" }} />
    </ToolShell>
  );
}

function UrlTool() {
  const [inT, setInT] = useState("");
  const [out, setOut] = useState("");
  const [err, setErr] = useState("");
  return (
    <ToolShell title="URL Encode / Decode">
      <textarea rows={3} value={inT} onChange={(e) => setInT(e.target.value)} style={{ ...fieldStyle(), resize: "vertical" }} />
      <div className="flex gap-2">
        <button type="button" style={btnStyle(true)} onClick={() => { setErr(""); setOut(encodeURIComponent(inT)); }}>Encode</button>
        <button type="button" style={btnStyle()} onClick={() => { try { setErr(""); setOut(decodeURIComponent(inT)); } catch { setErr("Invalid encoding"); } }}>Decode</button>
        {out && <CopyBtn value={out} />}
      </div>
      {err && <p className="text-xs" style={{ color: S.danger }}>{err}</p>}
      <textarea rows={3} readOnly value={out} style={{ ...fieldStyle(), resize: "vertical" }} />
    </ToolShell>
  );
}

function clamp(n: number, a: number, b: number) { return Math.min(b, Math.max(a, n)); }

function hexToRgb(hex: string) {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16) };
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb(h: number, s: number, l: number) {
  h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: Math.round(hue(h + 1 / 3) * 255), g: Math.round(hue(h) * 255), b: Math.round(hue(h - 1 / 3) * 255) };
}

function ColorTool() {
  const [hex, setHex] = useState("#4a90d9");
  const [r, setR] = useState(74);
  const [g, setG] = useState(144);
  const [b, setB] = useState(217);
  const [h, setH] = useState(210);
  const [s, setS] = useState(65);
  const [l, setL] = useState(57);
  const applyRgb = (nr: number, ng: number, nb: number) => {
    setR(nr); setG(ng); setB(nb);
    setHex("#" + [nr, ng, nb].map((x) => x.toString(16).padStart(2, "0")).join(""));
    const hsl = rgbToHsl(nr, ng, nb);
    setH(hsl.h); setS(hsl.s); setL(hsl.l);
  };
  return (
    <ToolShell title="Color Converter">
      <div className="flex gap-3 items-start">
        <div className="w-16 h-16 rounded-xl flex-shrink-0" style={{ background: hex, border: `1px solid ${S.border}` }} />
        <div className="flex-1 space-y-2">
          {label("Hex")}
          <input value={hex} onChange={(e) => { setHex(e.target.value); const rgb = hexToRgb(e.target.value); if (rgb) applyRgb(rgb.r, rgb.g, rgb.b); }} style={fieldStyle()} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {([["R", r, setR], ["G", g, setG], ["B", b, setB]] as const).map(([t, v, set]) => (
          <div key={t}>{label(t)}<input type="number" min={0} max={255} value={v} onChange={(e) => { const n = clamp(+e.target.value || 0, 0, 255); if (t === "R") applyRgb(n, g, b); else if (t === "G") applyRgb(r, n, b); else applyRgb(r, g, n); set(n); }} style={fieldStyle()} /></div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {([["H", h, 360], ["S", s, 100], ["L", l, 100]] as const).map(([t, v, max]) => (
          <div key={t}>{label(t)}<input type="number" min={0} max={max} value={v} onChange={(e) => {
            const n = clamp(+e.target.value || 0, 0, max);
            const nh = t === "H" ? n : h, ns = t === "S" ? n : s, nl = t === "L" ? n : l;
            setH(nh); setS(ns); setL(nl);
            const rgb = hslToRgb(nh, ns, nl);
            setR(rgb.r); setG(rgb.g); setB(rgb.b);
            setHex("#" + [rgb.r, rgb.g, rgb.b].map((x) => x.toString(16).padStart(2, "0")).join(""));
          }} style={fieldStyle()} /></div>
        ))}
      </div>
      <div className="flex gap-2"><CopyBtn value={hex} /><CopyBtn value={`rgb(${r}, ${g}, ${b})`} /><CopyBtn value={`hsl(${h}, ${s}%, ${l}%)`} /></div>
    </ToolShell>
  );
}

function LoremTool() {
  const [paras, setParas] = useState(2);
  const [out, setOut] = useState(LOREM + "\n\n" + LOREM);
  const gen = () => setOut(Array.from({ length: Math.min(20, Math.max(1, paras)) }, () => LOREM).join("\n\n"));
  return (
    <ToolShell title="Lorem Ipsum">
      {label("Paragraphs")}
      <input type="number" min={1} max={20} value={paras} onChange={(e) => setParas(+e.target.value)} style={fieldStyle()} />
      <div className="flex gap-2"><button type="button" style={btnStyle(true)} onClick={gen}>Generate</button><CopyBtn value={out} /></div>
      <textarea rows={8} readOnly value={out} style={{ ...fieldStyle(), resize: "vertical" }} />
    </ToolShell>
  );
}

function TimestampTool() {
  const [unix, setUnix] = useState(String(Math.floor(Date.now() / 1000)));
  const [iso, setIso] = useState(new Date().toISOString());
  const [err, setErr] = useState("");
  const toDate = () => {
    try {
      const n = Number(unix);
      if (!Number.isFinite(n)) throw new Error("Invalid");
      const ms = Math.abs(n) < 1e12 ? n * 1000 : n;
      setIso(new Date(ms).toISOString());
      setErr("");
    } catch { setErr("Invalid unix timestamp"); }
  };
  const toUnix = () => {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) throw new Error("Invalid");
      setUnix(String(Math.floor(d.getTime() / 1000)));
      setErr("");
    } catch { setErr("Invalid date"); }
  };
  return (
    <ToolShell title="Timestamp Converter">
      {label("Unix")}
      <input value={unix} onChange={(e) => setUnix(e.target.value)} style={fieldStyle()} />
      {label("ISO / Date")}
      <input value={iso} onChange={(e) => setIso(e.target.value)} style={fieldStyle()} />
      <div className="flex flex-wrap gap-2">
        <button type="button" style={btnStyle(true)} onClick={toDate}>Unix → Date</button>
        <button type="button" style={btnStyle()} onClick={toUnix}>Date → Unix</button>
        <button type="button" style={btnStyle()} onClick={() => { const n = Math.floor(Date.now() / 1000); setUnix(String(n)); setIso(new Date().toISOString()); }}>Now</button>
        <CopyBtn value={unix} /><CopyBtn value={iso} />
      </div>
      {err && <p className="text-xs" style={{ color: S.danger }}>{err}</p>}
    </ToolShell>
  );
}

function CounterTool() {
  const [t, setT] = useState("");
  const words = t.trim() ? t.trim().split(/\s+/).length : 0;
  const chars = t.length;
  const lines = t ? t.split(/\n/).length : 0;
  return (
    <ToolShell title="Word / Character Counter">
      <textarea rows={8} value={t} onChange={(e) => setT(e.target.value)} style={{ ...fieldStyle(), resize: "vertical" }} placeholder="Type or paste text…" />
      <div className="flex gap-4 text-sm" style={{ color: S.textSub }}>
        <span>{words} words</span><span>{chars} chars</span><span>{lines} lines</span>
      </div>
    </ToolShell>
  );
}

function CaseTool() {
  const [t, setT] = useState("");
  const upper = t.toUpperCase();
  const lower = t.toLowerCase();
  const title = t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const camel = t.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase()).replace(/^[A-Z]/, (c) => c.toLowerCase());
  const snake = t.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const rows = [["UPPER", upper], ["lower", lower], ["Title Case", title], ["camelCase", camel], ["snake_case", snake]] as const;
  return (
    <ToolShell title="Case Converter">
      <textarea rows={3} value={t} onChange={(e) => setT(e.target.value)} style={{ ...fieldStyle(), resize: "vertical" }} />
      <div className="space-y-2">
        {rows.map(([name, val]) => (
          <div key={name} className="flex items-center gap-2">
            <span className="text-[11px] w-24 flex-shrink-0" style={{ color: S.textMuted }}>{name}</span>
            <input readOnly value={val} style={{ ...fieldStyle(), flex: 1 }} />
            <CopyBtn value={val} />
          </div>
        ))}
      </div>
    </ToolShell>
  );
}

function SlugifyTool() {
  const [t, setT] = useState("Hello World!");
  const slug = t.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (
    <ToolShell title="Slugify">
      <input value={t} onChange={(e) => setT(e.target.value)} style={fieldStyle()} />
      <div className="flex gap-2 items-center"><input readOnly value={slug} style={{ ...fieldStyle(), flex: 1 }} /><CopyBtn value={slug} /></div>
    </ToolShell>
  );
}

function DiffTool() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const al = a.split("\n");
  const bl = b.split("\n");
  const max = Math.max(al.length, bl.length);
  const rows = Array.from({ length: max }, (_, i) => {
    const L = al[i] ?? "";
    const R = bl[i] ?? "";
    const same = L === R;
    return { L, R, same };
  });
  return (
    <ToolShell title="Diff Checker">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <textarea rows={6} value={a} onChange={(e) => setA(e.target.value)} style={{ ...fieldStyle(), resize: "vertical" }} placeholder="Original…" />
        <textarea rows={6} value={b} onChange={(e) => setB(e.target.value)} style={{ ...fieldStyle(), resize: "vertical" }} placeholder="Changed…" />
      </div>
      <div className="rounded-xl overflow-hidden text-xs font-mono max-h-64 overflow-y-auto" style={{ border: `1px solid ${S.border}` }}>
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-2 gap-0" style={{ background: row.same ? "transparent" : "hsla(0,60%,40%,0.12)", borderBottom: `1px solid ${S.border}` }}>
            <div className="px-2 py-1 whitespace-pre-wrap" style={{ color: row.same ? S.textSub : S.danger, borderRight: `1px solid ${S.border}` }}>{row.L || " "}</div>
            <div className="px-2 py-1 whitespace-pre-wrap" style={{ color: row.same ? S.textSub : S.success }}>{row.R || " "}</div>
          </div>
        ))}
      </div>
    </ToolShell>
  );
}

function RegexTool() {
  const [pattern, setPattern] = useState("\\w+");
  const [flags, setFlags] = useState("g");
  const [text, setText] = useState("Hello world 123");
  let matches: string[] = [];
  let err = "";
  try {
    const re = new RegExp(pattern, flags);
    matches = text.match(re) || [];
  } catch (e) {
    err = e instanceof Error ? e.message : "Invalid regex";
  }
  return (
    <ToolShell title="Regex Tester">
      <div className="grid grid-cols-[1fr_80px] gap-2">
        <div>{label("Pattern")}<input value={pattern} onChange={(e) => setPattern(e.target.value)} style={{ ...fieldStyle(), fontFamily: "ui-monospace, monospace" }} /></div>
        <div>{label("Flags")}<input value={flags} onChange={(e) => setFlags(e.target.value)} style={fieldStyle()} /></div>
      </div>
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} style={{ ...fieldStyle(), resize: "vertical" }} />
      {err ? <p className="text-xs" style={{ color: S.danger }}>{err}</p> : (
        <div className="text-xs space-y-1" style={{ color: S.textSub }}>
          <p>{matches.length} match{matches.length === 1 ? "" : "es"}</p>
          {matches.slice(0, 50).map((m, i) => <code key={i} className="block px-2 py-1 rounded-lg" style={{ background: S.elevated, border: `1px solid ${S.border}`, color: S.text }}>{m}</code>)}
        </div>
      )}
    </ToolShell>
  );
}

function BaseConvTool() {
  const [dec, setDec] = useState("255");
  const [bin, setBin] = useState("11111111");
  const [oct, setOct] = useState("377");
  const [hex, setHex] = useState("ff");
  const from = (val: string, base: number) => {
    try {
      const n = parseInt(val.replace(/\s/g, ""), base);
      if (!Number.isFinite(n)) return;
      setDec(String(n)); setBin(n.toString(2)); setOct(n.toString(8)); setHex(n.toString(16));
    } catch {}
  };
  const row = (name: string, val: string, base: number, set: (v: string) => void) => (
    <div key={name}>{label(name)}<div className="flex gap-2"><input value={val} onChange={(e) => { set(e.target.value); from(e.target.value, base); }} style={{ ...fieldStyle(), fontFamily: "ui-monospace, monospace", flex: 1 }} /><CopyBtn value={val} /></div></div>
  );
  return (
    <ToolShell title="Number Base Converter">
      {row("Decimal", dec, 10, setDec)}
      {row("Binary", bin, 2, setBin)}
      {row("Octal", oct, 8, setOct)}
      {row("Hex", hex, 16, setHex)}
    </ToolShell>
  );
}

function JwtTool() {
  const [tok, setTok] = useState("");
  const [header, setHeader] = useState("");
  const [payload, setPayload] = useState("");
  const [err, setErr] = useState("");
  const decodePart = (p: string) => {
    const pad = p.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((p.length + 3) % 4);
    return JSON.stringify(JSON.parse(decodeURIComponent(escape(atob(pad)))), null, 2);
  };
  const run = () => {
    try {
      const parts = tok.trim().split(".");
      if (parts.length < 2) throw new Error("Need at least header.payload");
      setHeader(decodePart(parts[0]));
      setPayload(decodePart(parts[1]));
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Decode failed");
      setHeader(""); setPayload("");
    }
  };
  return (
    <ToolShell title="JWT Decoder">
      <textarea rows={3} value={tok} onChange={(e) => setTok(e.target.value)} style={{ ...fieldStyle(), fontFamily: "ui-monospace, monospace", resize: "vertical" }} placeholder="eyJ…" />
      <button type="button" style={btnStyle(true)} onClick={run}>Decode</button>
      {err && <p className="text-xs" style={{ color: S.danger }}>{err}</p>}
      {header && <div>{label("Header")}<textarea rows={4} readOnly value={header} style={{ ...fieldStyle(), fontFamily: "ui-monospace, monospace" }} /><CopyBtn value={header} /></div>}
      {payload && <div>{label("Payload")}<textarea rows={6} readOnly value={payload} style={{ ...fieldStyle(), fontFamily: "ui-monospace, monospace" }} /><CopyBtn value={payload} /></div>}
      <p className="text-[10px]" style={{ color: S.textMuted }}>Decode only — signature is not verified</p>
    </ToolShell>
  );
}

function HtmlEntityTool() {
  const [inT, setInT] = useState("<div>Hello & welcome</div>");
  const [out, setOut] = useState("");
  const enc = () => setOut(inT.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"));
  const dec = () => {
    const map: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };
    setOut(inT.replace(/&(#39|amp|lt|gt|quot|apos);/g, (_, n) => map[n] || _));
  };
  return (
    <ToolShell title="HTML Entity Encode / Decode">
      <textarea rows={3} value={inT} onChange={(e) => setInT(e.target.value)} style={{ ...fieldStyle(), resize: "vertical" }} />
      <div className="flex gap-2"><button type="button" style={btnStyle(true)} onClick={enc}>Encode</button><button type="button" style={btnStyle()} onClick={dec}>Decode</button>{out && <CopyBtn value={out} />}</div>
      <textarea rows={3} readOnly value={out} style={{ ...fieldStyle(), resize: "vertical" }} />
    </ToolShell>
  );
}

function RandomTool() {
  const [min, setMin] = useState(1);
  const [max, setMax] = useState(100);
  const [out, setOut] = useState("");
  const gen = () => {
    const a = Math.min(min, max), b = Math.max(min, max);
    const n = a + Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] / (0xffffffff + 1) * (b - a + 1));
    setOut(String(n));
  };
  return (
    <ToolShell title="Random Number Generator">
      <div className="grid grid-cols-2 gap-2">
        <div>{label("Min")}<input type="number" value={min} onChange={(e) => setMin(+e.target.value)} style={fieldStyle()} /></div>
        <div>{label("Max")}<input type="number" value={max} onChange={(e) => setMax(+e.target.value)} style={fieldStyle()} /></div>
      </div>
      <div className="flex gap-2"><button type="button" style={btnStyle(true)} onClick={gen}>Generate</button>{out && <CopyBtn value={out} />}</div>
      {out && <p className="text-2xl font-medium" style={{ color: S.text }}>{out}</p>}
    </ToolShell>
  );
}

const CRON_NAMES = ["Minute", "Hour", "Day of month", "Month", "Day of week"];
function describeCronPart(part: string, idx: number): string {
  if (part === "*") return `every ${CRON_NAMES[idx].toLowerCase()}`;
  if (part.includes("/")) {
    const [base, step] = part.split("/");
    return `every ${step} ${CRON_NAMES[idx].toLowerCase()}${base !== "*" ? ` starting at ${base}` : ""}`;
  }
  if (part.includes("-")) return `${CRON_NAMES[idx]} from ${part.replace("-", " to ")}`;
  if (part.includes(",")) return `${CRON_NAMES[idx]} at ${part.split(",").join(", ")}`;
  return `${CRON_NAMES[idx]} = ${part}`;
}

function CronTool() {
  const [expr, setExpr] = useState("*/5 * * * *");
  const parts = expr.trim().split(/\s+/);
  const ok = parts.length === 5;
  return (
    <ToolShell title="Cron Expression Explainer">
      <input value={expr} onChange={(e) => setExpr(e.target.value)} style={{ ...fieldStyle(), fontFamily: "ui-monospace, monospace" }} placeholder="*/5 * * * *" />
      {!ok ? <p className="text-xs" style={{ color: S.danger }}>Need 5 fields: min hour dom month dow</p> : (
        <ul className="space-y-1.5 text-sm" style={{ color: S.textSub }}>
          {parts.map((p, i) => <li key={i}><span style={{ color: S.textMuted }}>{CRON_NAMES[i]}:</span> {describeCronPart(p, i)}</li>)}
        </ul>
      )}
    </ToolShell>
  );
}

function renderTool(id: ToolId) {
  switch (id) {
    case "password": return <PasswordTool />;
    case "base64": return <Base64Tool />;
    case "hash": return <HashTool />;
    case "uuid": return <UuidTool />;
    case "json": return <JsonTool />;
    case "url": return <UrlTool />;
    case "color": return <ColorTool />;
    case "lorem": return <LoremTool />;
    case "timestamp": return <TimestampTool />;
    case "counter": return <CounterTool />;
    case "case": return <CaseTool />;
    case "slugify": return <SlugifyTool />;
    case "diff": return <DiffTool />;
    case "regex": return <RegexTool />;
    case "baseconv": return <BaseConvTool />;
    case "jwt": return <JwtTool />;
    case "html": return <HtmlEntityTool />;
    case "random": return <RandomTool />;
    case "cron": return <CronTool />;
  }
}

export default function ToolsPage({ onNavigate: _onNavigate }: { onNavigate?: (url: string) => void }) {
  const [cat, setCat] = useState<Cat>("All");
  const [active, setActive] = useState<ToolId | null>(null);
  const filtered = TOOLS.filter((t) => cat === "All" || t.cat === cat);
  const meta = active ? TOOLS.find((t) => t.id === active) : null;
  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: "transparent" }}>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease }}
        className="flex items-center gap-3 px-6 py-4 flex-shrink-0"
        style={{ borderBottom: "1px solid hsl(216 20% 16% / 0.7)", background: "hsla(216, 30%, 8%, 0.35)", backdropFilter: "blur(10px)" }}
      >
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "hsl(216 22% 12%)", border: "1px solid hsl(216 20% 16%)" }}>
          <Wrench size={16} style={{ color: S.accent }} />
        </div>
        <div>
          <h1 className="text-base font-semibold" style={{ color: S.text }}>Tools</h1>
          <p className="text-xs" style={{ color: S.textSub }}>Handy utilities for developers and creators</p>
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {active && meta ? (
          <motion.div
            key="detail"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.28, ease }}
            className="flex-1 overflow-y-auto px-6 py-4"
          >
            <button
              type="button"
              onClick={() => setActive(null)}
              className="inline-flex items-center gap-1.5 text-xs mb-4 px-2.5 py-1.5 rounded-lg transition-colors"
              style={{ background: S.elevated, border: `1px solid ${S.border}`, color: S.textSub }}
            >
              <ArrowLeft size={12} /> Back to tools
            </button>
            {renderTool(active)}
          </motion.div>
        ) : (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col min-h-0"
          >
            <div className="flex gap-1.5 px-6 py-3 flex-shrink-0 overflow-x-auto">
              {CATS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCat(c)}
                  className="px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-colors"
                  style={{
                    background: cat === c ? S.accentDim : S.elevated,
                    border: `1px solid ${cat === c ? S.accent : S.border}`,
                    color: cat === c ? S.text : S.textSub,
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto px-6 pb-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.map((t, index) => {
                  const Icon = t.icon;
                  return (
                    <motion.button
                      key={t.id}
                      type="button"
                      onClick={() => setActive(t.id)}
                      initial={{ opacity: 0, y: 14, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.4, delay: Math.min(index, 18) * 0.03, ease }}
                      whileHover={{ scale: 1.03, y: -2, zIndex: 5 }}
                      whileTap={{ scale: 0.985 }}
                      className="text-left rounded-xl p-4 group relative overflow-hidden"
                      style={{
                        background: "hsla(216, 26%, 9%, 0.85)",
                        border: `1px solid ${S.border}`,
                        boxShadow: "0 6px 18px rgba(0,0,0,0.2)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "hsla(210, 70%, 70%, 0.45)";
                        e.currentTarget.style.boxShadow = "0 10px 28px rgba(0,0,0,0.32), 0 0 0 1px hsla(210, 70%, 70%, 0.18)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = S.border;
                        e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,0,0,0.2)";
                      }}
                    >
                      <div
                        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{ background: "linear-gradient(145deg, hsla(210, 60%, 50%, 0.08), transparent 55%)" }}
                      />
                      <div className="flex items-start gap-3 relative">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-105"
                          style={{ background: S.elevated, border: `1px solid ${S.border}` }}
                        >
                          <Icon size={16} style={{ color: S.accent }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="text-sm font-medium truncate" style={{ color: S.text }}>{t.name}</h3>
                            <ChevronRight size={14} className="opacity-50 group-hover:opacity-90 group-hover:translate-x-0.5 transition-all" style={{ color: S.textMuted }} />
                          </div>
                          <p className="text-xs mt-0.5" style={{ color: S.textSub }}>{t.desc}</p>
                          <p className="text-[10px] mt-2 uppercase tracking-wider" style={{ color: S.textMuted }}>{t.cat}</p>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
