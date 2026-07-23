import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import FOG from "vanta/dist/vanta.fog.min";
import NET from "vanta/dist/vanta.net.min";

const DEFAULT_BG = "#020810";

const SPACE_THEME = {
  highlightColor: 0x2f5a8a,
  midtoneColor: 0x14304f,
  lowlightColor: 0x071022,
  baseColor: 0x020810,
};

function parseColor(input?: string | null): number {
  if (!input) return SPACE_THEME.baseColor;
  const raw = input.trim();
  if (raw.startsWith("#") && (raw.length === 7 || raw.length === 4)) {
    if (raw.length === 4) {
      const r = raw[1];
      const g = raw[2];
      const b = raw[3];
      return parseInt(`0x${r}${r}${g}${g}${b}${b}`, 16);
    }
    return parseInt(raw.slice(1), 16);
  }
  const hsl = raw.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)/i);
  if (hsl) {
    const h = parseFloat(hsl[1]) / 360;
    const s = parseFloat(hsl[2]) / 100;
    const l = parseFloat(hsl[3]) / 100;
    const hue2rgb = (p: number, q: number, t: number) => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
    const g = Math.round(hue2rgb(p, q, h) * 255);
    const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
    return (r << 16) + (g << 8) + b;
  }
  return SPACE_THEME.baseColor;
}

function shade(hex: number, factor: number) {
  const r = Math.min(255, Math.max(0, Math.round(((hex >> 16) & 0xff) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((hex >> 8) & 0xff) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((hex & 0xff) * factor)));
  return (r << 16) + (g << 8) + b;
}

function readBg() {
  return localStorage.getItem("backgroundColor") || DEFAULT_BG;
}

function readNetwork() {
  return localStorage.getItem("bgNetwork") === "true";
}

function viewportSize() {
  const w = Math.max(
    window.innerWidth || 0,
    document.documentElement?.clientWidth || 0,
    document.body?.clientWidth || 0
  );
  const h = Math.max(
    window.innerHeight || 0,
    document.documentElement?.clientHeight || 0,
    document.body?.clientHeight || 0
  );
  return { w: Math.ceil(w + 2), h: Math.ceil(h + 2) };
}

function fitVantaCanvas(el: HTMLElement | null, effect: any) {
  if (!el) return;
  const { w, h } = viewportSize();
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.style.left = "0";
  el.style.top = "0";
  el.style.right = "auto";
  el.style.bottom = "auto";

  try {
    effect?.resize?.();
  } catch {}

  const canvas = el.querySelector("canvas") as HTMLCanvasElement | null;
  if (canvas) {
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.style.maxWidth = "none";
    canvas.style.maxHeight = "none";
    canvas.style.display = "block";
    canvas.style.position = "absolute";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.inset = "auto";
    try {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const bw = Math.floor(w * dpr);
      const bh = Math.floor(h * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
    } catch {}
  }

  try {
    effect?.resize?.();
  } catch {}
}

export default function VantaBackground() {
  const fogRef = useRef<HTMLDivElement>(null);
  const netRef = useRef<HTMLDivElement>(null);
  const fogEffect = useRef<any>(null);
  const netEffect = useRef<any>(null);
  const [bg, setBg] = useState(readBg);
  const [network, setNetwork] = useState(readNetwork);

  useEffect(() => {
    const sync = () => {
      setBg(readBg());
      setNetwork(readNetwork());
    };
    window.addEventListener("petezah-settings-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("petezah-settings-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!fogRef.current) return;
    const base = parseColor(bg);
    const theme = {
      baseColor: base || SPACE_THEME.baseColor,
      lowlightColor: shade(SPACE_THEME.lowlightColor, 1) || SPACE_THEME.lowlightColor,
      midtoneColor: SPACE_THEME.midtoneColor,
      highlightColor: SPACE_THEME.highlightColor,
    };

    try {
      if (fogEffect.current) {
        fogEffect.current.setOptions({
          ...theme,
          blurFactor: 0.85,
          speed: 1.35,
          zoom: 0.92,
        });
      } else {
        fogEffect.current = FOG({
          el: fogRef.current,
          THREE,
          mouseControls: true,
          touchControls: true,
          gyroControls: false,
          minHeight: 200,
          minWidth: 200,
          blurFactor: 0.85,
          speed: 1.35,
          zoom: 0.92,
          ...theme,
        });
      }
    } catch {}

    const syncSize = () => {
      fitVantaCanvas(fogRef.current, fogEffect.current);
      fitVantaCanvas(netRef.current, netEffect.current);
    };

    syncSize();
    const t1 = window.setTimeout(syncSize, 50);
    const t2 = window.setTimeout(syncSize, 250);
    const t3 = window.setTimeout(syncSize, 800);
    const t4 = window.setTimeout(syncSize, 1600);

    window.addEventListener("resize", syncSize);
    window.addEventListener("orientationchange", syncSize);
    window.visualViewport?.addEventListener("resize", syncSize);

    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(syncSize);
      if (fogRef.current) ro.observe(fogRef.current);
      ro.observe(document.documentElement);
      if (document.body) ro.observe(document.body);
    } catch {}

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(t4);
      window.removeEventListener("resize", syncSize);
      window.removeEventListener("orientationchange", syncSize);
      window.visualViewport?.removeEventListener("resize", syncSize);
      try {
        ro?.disconnect();
      } catch {}
    };
  }, [bg]);

  useEffect(() => {
    if (!network) {
      try {
        netEffect.current?.destroy?.();
      } catch {}
      netEffect.current = null;
      return;
    }
    if (!netRef.current) return;
    try {
      if (!netEffect.current) {
        netEffect.current = NET({
          el: netRef.current,
          THREE,
          mouseControls: true,
          touchControls: true,
          gyroControls: false,
          minHeight: 200,
          minWidth: 200,
          scale: 1,
          scaleMobile: 1,
          color: 0x3a6a9a,
          backgroundColor: 0x000000,
          points: 6,
          maxDistance: 14,
          spacing: 26,
          showDots: false,
        });
      }
      fitVantaCanvas(netRef.current, netEffect.current);
    } catch {}
  }, [network]);

  useEffect(() => {
    return () => {
      try {
        fogEffect.current?.destroy?.();
        netEffect.current?.destroy?.();
      } catch {}
      fogEffect.current = null;
      netEffect.current = null;
    };
  }, []);

  const fullBleed: CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100dvh",
    zIndex: 0,
    pointerEvents: "none",
    overflow: "hidden",
  };

  return (
    <>
      <div
        ref={fogRef}
        className="vanta vanta-full"
        aria-hidden
        style={{
          ...fullBleed,
          background: bg || DEFAULT_BG,
        }}
      />
      <div
        aria-hidden
        className="space-twinkle"
        style={fullBleed}
      />
      {network && (
        <div
          ref={netRef}
          className="vanta-full"
          aria-hidden
          style={{
            ...fullBleed,
            opacity: 0.12,
            mixBlendMode: "screen",
          }}
        />
      )}
    </>
  );
}