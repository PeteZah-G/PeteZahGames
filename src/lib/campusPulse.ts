const PATHS = ["/api/study/session", "/api/flashcards/stats", "/api/quiz/progress"];

let started = false;

function schedule(next: () => void) {
  const base = typeof document !== "undefined" && document.hidden ? 120000 : 55000;
  const jitter = Math.floor(Math.random() * 45000);
  window.setTimeout(next, base + jitter);
}

function tick() {
  if (typeof document !== "undefined" && document.hidden) {
    schedule(tick);
    return;
  }
  const path = PATHS[Math.floor(Math.random() * PATHS.length)];
  fetch(path, { credentials: "same-origin", cache: "no-store" }).catch(() => {});
  schedule(tick);
}

export function startCampusPulse() {
  if (started || typeof window === "undefined") return;
  started = true;
  const boot = () => schedule(tick);
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(boot, { timeout: 12000 });
  } else {
    window.setTimeout(boot, 4000);
  }
}
