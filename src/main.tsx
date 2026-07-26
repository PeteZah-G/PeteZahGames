import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { loadFontMaps } from "./lib/fontObfuscation";

const fontObf = document.createElement("script");
fontObf.src = "/font-obfuscation.js";
fontObf.async = true;
document.head.appendChild(fontObf);
loadFontMaps();
if (document.fonts?.load) {
  document.fonts.load("600 16px plusjakartasans-obf").catch(() => {});
}

if (/CrOS/.test(navigator.userAgent)) {
  document.documentElement.classList.add('chromeos');
}

function applyStoredSettings() {
  const get = (k: string) => localStorage.getItem(k);

  const theme = get("theme");
  if (theme) {
    document.body.className = document.body.className.replace(/theme-[\w-]+/g, "").trim();
    document.body.classList.add(`theme-${theme}`);
  }

  const siteTitle = get("siteTitle");
  if (siteTitle) {
    document.title = siteTitle;
  } else {
    setTimeout(() => { document.title = "PeteZah"; }, 3000);
  }

  const siteLogo = get("siteLogo");
  if (siteLogo) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
    link.href = siteLogo;
  }

  const bgImg = get("backgroundImage");
  const bgColor = get("backgroundColor") || (get("theme") ? ({
    "default": "#0A1D37", "swampy-green": "#1A3C34", "royal-purple": "#2A1A3C",
    "blood-red": "#3C0A1A", "midnight-forest": "#1F2A2F", "cyber-neon": "#1A1A2E",
    "desert-oasis": "#3C2F1A", "glacial-frost": "#2A3C4F"
  } as Record<string,string>)[get("theme")!] : null);
  // Apply to both body AND YES AND html so nothing overrides it
  const applyBg = (prop: string, val: string) => {
    document.body.style.setProperty(prop, val, "important");
    document.documentElement.style.setProperty(prop, val, "important");
  };
  if (bgImg) {
    applyBg("background-image", `url(${bgImg})`);
    applyBg("background-size", "cover");
    applyBg("background-repeat", "no-repeat");
    applyBg("background-position", "center");
    applyBg("background-color", "");
  } else if (bgColor) {
    applyBg("background-image", "none");
    applyBg("background-color", bgColor);
  }

  if (get("disableRightClick") === "true") {
    const h = (e: MouseEvent) => e.preventDefault();
    (window as any).__rightClickHandler = h;
    document.addEventListener("contextmenu", h);
  }

  if (get("beforeUnload") === "true") {
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    (window as any).__beforeUnloadHandler = h;
    window.addEventListener("beforeunload", h);
  }

  const panicKey = get("panicKey");
  const panicUrl = get("panicUrl");
  if (panicKey && panicUrl) {
    const h = (e: KeyboardEvent) => { if (e.key === panicKey) window.location.href = panicUrl; };
    (window as any).__panicKeyHandler = h;
    window.addEventListener("keydown", h);
  }

  if (get("disableParticles") === "true") {
    const removeParticles = () => {
      document.querySelectorAll(".particles, .particle").forEach(el => el.parentNode?.removeChild(el));
    };
    removeParticles();
    setTimeout(removeParticles, 500);
    setTimeout(removeParticles, 1500);
  }

  window.addEventListener("storage", (e) => {
    if (e.key === "settingsUpdated") applyStoredSettings();
  });
  window.addEventListener("petezah-settings-updated", () => applyStoredSettings());
}

if (!localStorage.getItem("theme")) {
  localStorage.setItem("theme", "default");
}
if (!localStorage.getItem("backgroundColor")) {
  localStorage.setItem("backgroundColor", "#020810");
}
if (localStorage.getItem("bgNetwork") === null) {
  localStorage.setItem("bgNetwork", "false");
}
applyStoredSettings();

if (
  localStorage.getItem("autocloak") === "true" &&
  window === window.top &&
  !/Firefox/.test(navigator.userAgent)
) {
  const w = window.open("about:blank", "_blank");
  if (w && !w.closed) {
    w.document.title = localStorage.getItem("siteTitle") || "Home";
    const link = w.document.createElement("link");
    link.rel = "icon";
    link.href = localStorage.getItem("siteLogo") || "/logo.png";
    w.document.head.appendChild(link);
    const iframe = w.document.createElement("iframe");
    iframe.src = "/";
    iframe.style.cssText = "width:100vw;height:100vh;border:none;";
    w.document.body.style.margin = "0";
    w.document.body.appendChild(iframe);
    window.location.href = localStorage.getItem("panicUrl") || "https://classroom.google.com";
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);