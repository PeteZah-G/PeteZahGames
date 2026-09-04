import { RAIN_SCENES, type RainSceneId } from "./rainScenes";

export type BgEffectId = "fog" | "rain" | "sakura" | "lightning" | "stars" | "snow" | "solid";

export type BgEffectMeta = {
  id: BgEffectId;
  label: string;
  blurb: string;
  accent: string;
  pair: string;
};

export const BG_EFFECTS: BgEffectMeta[] = [
  {
    id: "rain",
    label: "Rain glass",
    blurb: "Wet-window WebGL rain over a night scene",
    accent: "#5a9ec8",
    pair: "Scene image",
  },
  {
    id: "fog",
    label: "Fog mesh",
    blurb: "Soft Vanta fog with optional network lines",
    accent: "#6eb0d4",
    pair: "Theme color",
  },
  {
    id: "sakura",
    label: "Spirit tree",
    blurb: "Animated forest loop (privacy YouTube embed)",
    accent: "#7ec8a0",
    pair: "Live wallpaper",
  },
  {
    id: "lightning",
    label: "Lightning",
    blurb: "Yellow lightning animated loop",
    accent: "#f0d060",
    pair: "Live wallpaper",
  },
  {
    id: "stars",
    label: "Starfield",
    blurb: "Deep space with twinkles and shooting stars",
    accent: "#c8d4f0",
    pair: "Black base",
  },
  {
    id: "snow",
    label: "Snowfall",
    blurb: "Light drifting snow for cool palettes",
    accent: "#d8e8f8",
    pair: "Color or image",
  },
  {
    id: "solid",
    label: "Still",
    blurb: "Solid color or your own image only",
    accent: "#8a96a8",
    pair: "Color or image",
  },
];

export function normalizeBgEffect(raw?: string | null): BgEffectId {
  const v = String(raw || "").trim();
  if (v === "vanta") return "fog";
  if (BG_EFFECTS.some((e) => e.id === v)) return v as BgEffectId;
  try {
    if (localStorage.getItem("rainBackdrop") === "true") return "rain";
  } catch {}
  return "rain";
}

export function readBgEffect(): BgEffectId {
  try {
    return normalizeBgEffect(localStorage.getItem("bgEffect"));
  } catch {
    return "rain";
  }
}

export function syncBgEffectAttr(effect?: BgEffectId | null) {
  try {
    const id = effect || readBgEffect();
    document.documentElement.setAttribute("data-bg-effect", id);
  } catch {}
}

export { RAIN_SCENES };
export type { RainSceneId };
