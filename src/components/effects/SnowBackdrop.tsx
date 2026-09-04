import { useEffect, useRef } from "react";
import { isLiteDevice } from "@/lib/liteDevice";
import { themeById } from "@/lib/siteThemes";

type Flake = { x: number; y: number; r: number; vy: number; vx: number; a: number };

export default function SnowBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const base = (() => {
    try {
      const img = localStorage.getItem("backgroundImage");
      if (img) return { backgroundImage: `url(${img})`, backgroundSize: "cover", backgroundPosition: "center" as const };
      const c = localStorage.getItem("backgroundColor") || themeById(localStorage.getItem("theme")).bg;
      if (c) return { background: c };
    } catch {}
    return { background: "#060c12" };
  })();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const lite = isLiteDevice();
    const count = lite ? 40 : 70;
    let flakes: Flake[] = [];
    let raf = 0;
    let running = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, lite ? 1 : 1.5);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      flakes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 2.2 + 0.8,
        vy: Math.random() * 0.7 + 0.35,
        vx: Math.random() * 0.5 - 0.25,
        a: Math.random() * 0.45 + 0.35,
      }));
    };

    const tick = () => {
      if (!running) return;
      if (document.hidden) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      for (const f of flakes) {
        f.y += f.vy;
        f.x += f.vx + Math.sin(f.y * 0.01) * 0.2;
        if (f.y > h + 4) {
          f.y = -4;
          f.x = Math.random() * w;
        }
        if (f.x < -4) f.x = w + 4;
        if (f.x > w + 4) f.x = -4;
        ctx.beginPath();
        ctx.fillStyle = `rgba(235, 245, 255, ${f.a})`;
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };

    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        ...base,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
        }}
      />
    </div>
  );
}
