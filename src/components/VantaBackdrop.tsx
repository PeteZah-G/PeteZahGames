import { lazy, Suspense } from "react";
import { themeById } from "@/lib/siteThemes";

const VantaBackground = lazy(() => import("./VantaBackground"));

function StaticBackdrop() {
  let bg = "#020810";
  try {
    bg = localStorage.getItem("backgroundColor") || themeById(localStorage.getItem("theme")).bg || bg;
  } catch {}
  const img = (() => {
    try {
      return localStorage.getItem("backgroundImage") || "";
    } catch {
      return "";
    }
  })();
  if (img) {
    return (
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100dvh",
          zIndex: 0,
          pointerEvents: "none",
          backgroundImage: `url(${img})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundColor: bg,
        }}
      />
    );
  }
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100dvh",
        zIndex: 0,
        pointerEvents: "none",
        background: bg,
      }}
    />
  );
}

export default function VantaBackdrop() {
  return (
    <Suspense fallback={<StaticBackdrop />}>
      <VantaBackground />
    </Suspense>
  );
}
