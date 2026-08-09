import { useEffect, useState } from "react";

function readPing() {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav && typeof nav.responseStart === "number") {
      return Math.max(1, Math.round(nav.responseStart));
    }
  } catch {}
  return null;
}

export default function DebugHud() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem("debugHud") === "true");
  const [fps, setFps] = useState(0);
  const [ping, setPing] = useState<number | null>(readPing());
  const [mem, setMem] = useState<string>("—");

  useEffect(() => {
    const sync = () => setEnabled(localStorage.getItem("debugHud") === "true");
    window.addEventListener("petezah-settings-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("petezah-settings-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const loop = (t: number) => {
      frames += 1;
      if (t - last >= 500) {
        setFps(Math.round((frames * 1000) / (t - last)));
        frames = 0;
        last = t;
        const p = (performance as any).memory;
        if (p?.usedJSHeapSize) {
          setMem(`${Math.round(p.usedJSHeapSize / 1048576)} MB`);
        }
        setPing(readPing());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: 10,
        bottom: 34,
        zIndex: 90,
        padding: "6px 9px",
        borderRadius: 8,
        background: "hsla(220, 25%, 6%, 0.82)",
        border: "1px solid hsla(0,0%,100%,0.1)",
        color: "hsla(0,0%,100%,0.72)",
        fontSize: 10,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        lineHeight: 1.45,
        pointerEvents: "none",
        backdropFilter: "blur(8px)",
      }}
    >
      <div>FPS {fps || "—"}</div>
      <div>NAV {ping != null ? `${ping} ms` : "—"}</div>
      <div>HEAP {mem}</div>
    </div>
  );
}
