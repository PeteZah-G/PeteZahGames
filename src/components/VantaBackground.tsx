import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import FOG from "vanta/dist/vanta.fog.min";
import NET from "vanta/dist/vanta.net.min";
import { themeById } from "@/lib/siteThemes";

const DEFAULT_BG = "#020810";

function parseColor(input?: string | null): number {
  if (!input) return 0x020810;
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
  return 0x020810;
}

function readBg() {
  return localStorage.getItem("backgroundColor") || DEFAULT_BG;
}

function readNetwork() {
  return localStorage.getItem("bgNetwork") === "true";
}

function readBgImage() {
  return localStorage.getItem("backgroundImage") || "";
}

function readThemeId() {
  return localStorage.getItem("theme") || "aurora";
}

function viewportSize() {
  const vv = window.visualViewport;
  const w = Math.max(
    window.innerWidth || 0,
    vv?.width || 0,
    document.documentElement?.clientWidth || 0
  );
  const h = Math.max(
    window.innerHeight || 0,
    vv?.height || 0,
    document.documentElement?.clientHeight || 0
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
  const [bgImage, setBgImage] = useState(readBgImage);
  const [themeId, setThemeId] = useState(readThemeId);

  useEffect(() => {
    const sync = () => {
      setBg(readBg());
      setNetwork(readNetwork());
      setBgImage(readBgImage());
      setThemeId(readThemeId());
    };
    window.addEventListener("petezah-settings-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("petezah-settings-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (bgImage) {
      try {
        fogEffect.current?.destroy?.();
      } catch {}
      fogEffect.current = null;
      return;
    }
    if (!fogRef.current) return;
    const site = themeById(themeId);
    const base = parseColor(bg) || site.fog.base;
    const theme = {
      baseColor: base,
      lowlightColor: site.fog.low,
      midtoneColor: site.fog.mid,
      highlightColor: site.fog.highlight,
    };

    try {
      if (fogEffect.current) {
        fogEffect.current.setOptions({
          ...theme,
          blurFactor: 0.85,
          speed: 1.35,
          zoom: 1.3,
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
          zoom: 1.3,
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
  }, [bg, themeId, bgImage]);

  useEffect(() => {
    if (!network || bgImage) {
      try {
        netEffect.current?.destroy?.();
      } catch {}
      netEffect.current = null;
      return;
    }
    if (!netRef.current) return;
    const site = themeById(themeId);
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
          color: site.fog.net,
          backgroundColor: 0x000000,
          points: 6,
          maxDistance: 14,
          spacing: 26,
          showDots: false,
        });
      } else {
        netEffect.current.setOptions?.({ color: site.fog.net });
      }
      fitVantaCanvas(netRef.current, netEffect.current);
    } catch {}
  }, [network, themeId, bgImage]);

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

  if (bgImage) {
    return (
      <div
        aria-hidden
        style={{
          ...fullBleed,
          backgroundImage: `url(${bgImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundColor: bg || DEFAULT_BG,
        }}
      />
    );
  }

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
      <div aria-hidden className="space-twinkle" style={fullBleed} />
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
