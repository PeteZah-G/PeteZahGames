import YoutubeWallpaperBackdrop, { SPIRIT_TREE_VIDEO_ID } from "./YoutubeWallpaperBackdrop";

export { SPIRIT_TREE_VIDEO_ID };

export default function SakuraBackdrop() {
  return (
    <YoutubeWallpaperBackdrop
      videoId={SPIRIT_TREE_VIDEO_ID}
      title="Spirit Tree wallpaper"
      fallback="/fx/sakura/tree.jpg"
      wash="radial-gradient(ellipse 85% 70% at 50% 40%, hsla(150, 30%, 10%, 0.12) 0%, hsla(220, 28%, 5%, 0.42) 50%, hsla(220, 30%, 2%, 0.68) 100%), linear-gradient(180deg, hsla(220, 30%, 4%, 0.28) 0%, transparent 30%, hsla(220, 25%, 2%, 0.55) 100%)"
    />
  );
}
