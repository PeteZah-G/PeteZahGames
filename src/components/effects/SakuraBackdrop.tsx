import { useEffect, useRef } from "react";
import { isLiteDevice } from "@/lib/liteDevice";

declare global {
  interface Window {
    ChaerryJS?: {
      createEffect: (
        target: string | HTMLElement,
        opts?: Record<string, unknown>
      ) => { effect?: { destroy?: () => void; stop?: () => void; pause?: () => void } };
    };
  }
}

const SAKURA_TREE = "/fx/sakura/tree.jpg";

let scriptPromise: Promise<void> | null = null;

function loadChaerry(): Promise<void> {
  if (window.ChaerryJS?.createEffect) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/fx/sakura/chaerry.umd.min.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("sakura"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export default function SakuraBackdrop() {
  const hostRef = useRef<HTMLDivElement>(null);
  const customImg = (() => {
    try {
      return localStorage.getItem("backgroundImage") || "";
    } catch {
      return "";
    }
  })();
  const img = customImg || SAKURA_TREE;

  useEffect(() => {
    let destroyed = false;
    let handle: { destroy?: () => void; stop?: () => void; pause?: () => void } | null = null;
    const lite = isLiteDevice();

    (async () => {
      try {
        await loadChaerry();
        if (destroyed || !hostRef.current || !window.ChaerryJS?.createEffect) return;
        const { effect } = window.ChaerryJS.createEffect(hostRef.current, {
          count: lite ? 28 : 52,
          theme: "cherry",
          speed: lite ? 0.75 : 1,
          wind: 0.15,
          autoStart: true,
          loop: true,
          spawnInterval: lite ? 420 : 280,
        });
        handle = effect || null;
      } catch {}
    })();

    const onVis = () => {
      try {
        if (document.hidden) handle?.pause?.() || handle?.stop?.();
      } catch {}
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      destroyed = true;
      document.removeEventListener("visibilitychange", onVis);
      try {
        handle?.destroy?.();
        handle?.stop?.();
      } catch {}
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
        overflow: "hidden",
        background: "#08060c",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${img})`,
          backgroundSize: "cover",
          backgroundPosition: "center 35%",
          backgroundRepeat: "no-repeat",
          filter: customImg ? "none" : "brightness(0.72) saturate(1.05)",
          transform: "scale(1.02)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 85% 70% at 50% 40%, hsla(330, 35%, 12%, 0.18) 0%, hsla(280, 30%, 6%, 0.45) 48%, hsla(220, 25%, 3%, 0.72) 100%), linear-gradient(180deg, hsla(220, 30%, 4%, 0.35) 0%, transparent 28%, hsla(220, 25%, 2%, 0.55) 100%)",
        }}
      />
      <div
        ref={hostRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
    </div>
  );
}
