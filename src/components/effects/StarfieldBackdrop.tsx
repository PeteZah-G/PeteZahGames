import { useEffect, useRef } from "react";
import { isLiteDevice } from "@/lib/liteDevice";

type Star = { angle: number; radius: number; speed: number; size: number };
type Shot = { x: number; y: number; vx: number; vy: number; life: number; initialLife: number };

export default function StarfieldBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const lite = isLiteDevice();
    const numStars = lite ? 180 : 360;
    let stars: Star[] = [];
    let shots: Shot[] = [];
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
      stars = Array.from({ length: numStars }, () => ({
        angle: Math.random() * Math.PI * 2,
        radius: Math.random() * Math.sqrt(w * w + h * h),
        speed: Math.random() * 0.00028 + 0.00012,
        size: Math.random() * 1.3 + 0.4,
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
      ctx.fillStyle = "#02040a";
      ctx.fillRect(0, 0, w, h);

      const cx = w * 0.92;
      const cy = h * 0.88;
      const t = Date.now();
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        star.angle += star.speed;
        const x = cx + star.radius * Math.cos(star.angle);
        const y = cy + star.radius * Math.sin(star.angle);
        if (x < -4 || y < -4 || x > w + 4 || y > h + 4) continue;
        const flicker = 0.35 + Math.abs(Math.sin(t * 0.0014 + i)) * 0.55;
        ctx.beginPath();
        ctx.fillStyle = `rgba(230, 236, 255, ${flicker})`;
        ctx.arc(x, y, star.size, 0, Math.PI * 2);
        ctx.fill();
      }

      if (shots.length === 0 && Math.random() < (lite ? 0.004 : 0.01)) {
        shots.push({
          x: Math.random() * w * 0.55,
          y: Math.random() * h * 0.4,
          vx: 3 + Math.random() * 2.2,
          vy: 1 + Math.random() * 1.4,
          life: 70,
          initialLife: 70,
        });
      }
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        const opacity = s.life / s.initialLife;
        const grad = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 28, s.y - s.vy * 28);
        grad.addColorStop(0, `rgba(255,255,255,${opacity})`);
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 16, s.y - s.vy * 16);
        ctx.stroke();
        s.x += s.vx;
        s.y += s.vy;
        s.life -= 1;
        if (s.life <= 0) shots.splice(i, 1);
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
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        zIndex: 0,
        pointerEvents: "none",
        display: "block",
        background: "#02040a",
      }}
    />
  );
}
