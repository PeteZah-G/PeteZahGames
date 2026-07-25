import * as THREE from "/vendor/three/three.module.min.js";

const SPACE = {
  highlightColor: 0x2f5a8a,
  midtoneColor: 0x14304f,
  lowlightColor: 0x071022,
  baseColor: 0x020810,
  backgroundColor: 0x020810,
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load " + src));
    document.head.appendChild(s);
  });
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

function fit(el, effect) {
  if (!el) return;
  const { w, h } = viewportSize();
  el.style.width = w + "px";
  el.style.height = h + "px";
  el.style.left = "0";
  el.style.top = "0";
  try {
    effect?.resize?.();
  } catch {}
  const canvas = el.querySelector("canvas");
  if (canvas) {
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.style.maxWidth = "none";
    canvas.style.maxHeight = "none";
    canvas.style.display = "block";
    canvas.style.position = "absolute";
    canvas.style.left = "0";
    canvas.style.top = "0";
  }
  try {
    effect?.resize?.();
  } catch {}
}

async function boot() {
  const el = document.getElementById("vanta-bg");
  if (!el) return;

  el.style.background = "#020810";
  window.THREE = THREE;

  try {
    await loadScript("/vendor/vanta/vanta.fog.min.js");
  } catch {
    try {
      await loadScript("/vendor/vanta.fog.min.js");
    } catch {
      return;
    }
  }

  if (!window.VANTA || typeof window.VANTA.FOG !== "function") return;

  let effect = null;
  try {
    effect = window.VANTA.FOG({
      el,
      THREE,
      mouseControls: true,
      touchControls: true,
      gyroControls: false,
      minHeight: 200,
      minWidth: 200,
      blurFactor: 0.85,
      speed: 1.35,
      zoom: 1.3,
      scale: 1,
      scaleMobile: 1,
      ...SPACE,
    });
    try {
      effect?.setOptions?.(SPACE);
      effect?.updateUniforms?.();
    } catch {}
  } catch {
    return;
  }

  window.__pzVanta = effect;

  const sync = () => fit(el, effect);
  sync();
  window.addEventListener("resize", sync);
  window.addEventListener("orientationchange", sync);
  window.visualViewport?.addEventListener("resize", sync);
  setTimeout(sync, 50);
  setTimeout(sync, 250);
  setTimeout(sync, 800);
  setTimeout(sync, 1600);
}

boot();
