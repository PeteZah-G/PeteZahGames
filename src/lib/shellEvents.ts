export const FRAME_NAV_EVT = "hs-shell-nav";

export function emitFrameNav(detail: { tabId: string; url: string }) {
  window.dispatchEvent(new CustomEvent(FRAME_NAV_EVT, { detail }));
}
