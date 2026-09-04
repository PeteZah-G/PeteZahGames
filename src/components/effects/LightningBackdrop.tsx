import YoutubeWallpaperBackdrop, { LIGHTNING_VIDEO_ID } from "./YoutubeWallpaperBackdrop";

export { LIGHTNING_VIDEO_ID };

export default function LightningBackdrop() {
  return (
    <YoutubeWallpaperBackdrop
      videoId={LIGHTNING_VIDEO_ID}
      title="Yellow lightning wallpaper"
      wash="radial-gradient(ellipse 85% 70% at 50% 40%, hsla(48, 80%, 18%, 0.14) 0%, hsla(220, 30%, 5%, 0.4) 48%, hsla(220, 30%, 2%, 0.7) 100%), linear-gradient(180deg, hsla(220, 30%, 4%, 0.3) 0%, transparent 32%, hsla(220, 25%, 2%, 0.58) 100%)"
    />
  );
}
