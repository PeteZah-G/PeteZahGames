export function getHomeUrl(): string {
  try {
    if (localStorage.getItem("trendingHomescreen") === "true") {
      return "petezah://trending";
    }
  } catch {}
  return "petezah://newtab";
}

export function openTrendingOverlay() {
  window.dispatchEvent(new CustomEvent("petezah-open-trending"));
}
