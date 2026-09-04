export const RAIN_SCENES = [
  { id: "harbor", label: "Harbor lights" },
  { id: "trails", label: "Light trails" },
  { id: "aerial", label: "Aerial grid" },
  { id: "anime", label: "Blue clouds" },
  { id: "violet", label: "Violet towers" },
  { id: "nebula", label: "Night nebula" },
  { id: "bridges", label: "River bridges" },
] as const;

export type RainSceneId = (typeof RAIN_SCENES)[number]["id"];

export function rainSceneThumb(id: string) {
  return `/fx/rain/img/scenes/${id}/thumb.jpg`;
}

export function normalizeRainScene(raw?: string | null): RainSceneId {
  const id = String(raw || "").trim();
  if (RAIN_SCENES.some((s) => s.id === id)) return id as RainSceneId;
  return "harbor";
}
