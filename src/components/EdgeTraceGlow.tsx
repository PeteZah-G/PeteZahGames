import { useEffect, useState } from "react";

export default function SearchEdgeGlow({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setOn(false);
      return;
    }
    let alive = true;
    const tick = () => {
      if (!alive) return;
      setOn(true);
      window.setTimeout(() => {
        if (alive) setOn(false);
      }, 2800);
    };
    const first = window.setTimeout(tick, 1800);
    const iv = window.setInterval(tick, 7000);
    return () => {
      alive = false;
      window.clearTimeout(first);
      window.clearInterval(iv);
    };
  }, [enabled]);

  if (!enabled || !on) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: -1,
        pointerEvents: "none",
        zIndex: 2,
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 16,
          padding: 1.25,
          background:
            "conic-gradient(from var(--pz-edge-angle, 0deg), transparent 0deg, hsla(0,0%,100%,0.55) 28deg, transparent 70deg, transparent 360deg)",
          WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          animation: "pz-search-edge-spin 2.7s linear forwards",
          opacity: 0.9,
          filter: "drop-shadow(0 0 6px hsla(0,0%,100%,0.2))",
        }}
      />
      <style>{`
        @property --pz-edge-angle {
          syntax: '<angle>';
          inherits: false;
          initial-value: 0deg;
        }
        @keyframes pz-search-edge-spin {
          0% { --pz-edge-angle: 0deg; opacity: 0; }
          12% { opacity: 0.95; }
          88% { opacity: 0.7; }
          100% { --pz-edge-angle: 360deg; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
