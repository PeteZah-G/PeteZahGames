import { useEffect, useRef, useState } from "react";
import { normalizeRainScene } from "@/lib/rainScenes";

function rainEnabled(): boolean {
  try {
    return localStorage.getItem("rainBackdrop") === "true";
  } catch {
    return false;
  }
}

function sceneId(): string {
  try {
    return normalizeRainScene(localStorage.getItem("rainScene"));
  } catch {
    return "harbor";
  }
}

export default function RainBackdrop() {
  const [on, setOn] = useState(rainEnabled);
  const [scene, setScene] = useState(sceneId);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const sync = () => {
      setOn(rainEnabled());
      setScene(sceneId());
    };
    window.addEventListener("storage", sync);
    window.addEventListener("petezah-settings-updated", sync);
    const poll = window.setInterval(sync, 1200);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("petezah-settings-updated", sync);
      window.clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    if (!on) return;
    const post = (value: boolean) => {
      try {
        frameRef.current?.contentWindow?.postMessage({ type: "pz-rain-pause", value }, "*");
      } catch {}
    };
    const onVis = () => post(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [on]);

  if (!on) return null;

  return (
    <div
      id="rain-background"
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        zIndex: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <iframe
        key={scene}
        ref={frameRef}
        src={`/fx/rain/index.html?s=${encodeURIComponent(scene)}`}
        title=""
        tabIndex={-1}
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          border: "none",
          pointerEvents: "none",
          display: "block",
        }}
      />
    </div>
  );
}
