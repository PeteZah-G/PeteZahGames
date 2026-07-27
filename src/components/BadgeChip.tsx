import {
  Compass,
  Gamepad2,
  UserRound,
  Music,
  Bookmark,
  Bot,
  Monitor,
  Dice5,
  Globe,
  ListMusic,
  MessageCircle,
  Flame,
  Palette,
  Trophy,
  Timer,
  Star,
  Medal,
  Rocket,
  Sparkles,
  FlaskConical,
  Bug,
  Wrench,
  Crown,
} from "lucide-react";

export type BadgeInfo = {
  id: string;
  name: string;
  desc?: string;
  rarity: string;
  icon: string;
  color: string;
  unlocked?: boolean;
  unlockedAt?: number | null;
  manual?: boolean;
  progress?: { current: number; target: number; unit: string } | null;
};

const ICON_MAP: Record<string, any> = {
  Compass,
  Gamepad2,
  UserRound,
  Music,
  Bookmark,
  Bot,
  Monitor,
  Dice5,
  Globe,
  ListMusic,
  MessageCircle,
  Flame,
  Palette,
  Trophy,
  Timer,
  Star,
  Medal,
  Rocket,
  Sparkles,
  FlaskConical,
  Bug,
  Wrench,
  Crown,
};

const RARITY_STYLE: Record<string, { glow: string; label: string }> = {
  common: { glow: "hsla(160, 30%, 40%, 0.12)", label: "Common" },
  rare: { glow: "hsla(200, 45%, 42%, 0.14)", label: "Rare" },
  epic: { glow: "hsla(280, 40%, 42%, 0.15)", label: "Epic" },
  legendary: { glow: "hsla(40, 55%, 42%, 0.16)", label: "Legendary" },
  special: { glow: "hsla(350, 50%, 42%, 0.16)", label: "Special" },
};

export function BadgeChip({
  badge,
  size = 28,
  locked = false,
  showName = false,
  compact = false,
  subtle = false,
}: {
  badge: BadgeInfo;
  size?: number;
  locked?: boolean;
  showName?: boolean;
  compact?: boolean;
  subtle?: boolean;
}) {
  const rarity = RARITY_STYLE[badge.rarity] || RARITY_STYLE.common;
  const dim = locked || badge.unlocked === false;
  const Icon = ICON_MAP[badge.icon] || Star;
  const iconSize = Math.max(8, Math.round(size * (subtle ? 0.52 : 0.48)));

  return (
    <div
      title={`${badge.name}${badge.desc ? ` — ${badge.desc}` : ""} (${rarity.label})`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? 0 : 6,
        maxWidth: "100%",
        position: "relative",
      }}
    >
      <span
        className={dim || subtle ? undefined : "pz-badge-pulse"}
        style={{
          width: size,
          height: size,
          borderRadius: Math.max(6, size * 0.28),
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: dim ? "hsla(0,0%,100%,0.35)" : "#fff",
          background: dim
            ? "linear-gradient(145deg, hsla(220,18%,14%,0.95), hsla(220,16%,10%,0.95))"
            : `linear-gradient(145deg, color-mix(in srgb, ${badge.color} 32%, #0a1018), color-mix(in srgb, ${badge.color} 16%, #060a10))`,
          border: `1px solid ${dim ? "hsla(210,40%,80%,0.12)" : `${badge.color}40`}`,
          boxShadow: dim
            ? "none"
            : subtle
              ? `0 0 6px ${rarity.glow}`
              : `0 0 0 1px ${badge.color}18, 0 1px 6px ${rarity.glow}`,
          opacity: dim ? 0.42 : 1,
          filter: dim ? "grayscale(0.75)" : "none",
          flexShrink: 0,
        }}
      >
        <Icon size={iconSize} strokeWidth={2.2} style={{ color: dim ? undefined : badge.color }} />
      </span>
      {showName && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 650,
            color: dim ? "hsla(0,0%,100%,0.4)" : "hsla(0,0%,100%,0.88)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {badge.name}
        </span>
      )}
    </div>
  );
}

export function BadgeRow({
  badges,
  max = 8,
  size = 20,
  subtle = false,
}: {
  badges: BadgeInfo[];
  max?: number;
  size?: number;
  subtle?: boolean;
}) {
  if (!badges?.length) return null;
  const shown = badges.slice(0, max);
  return (
    <div style={{ display: "inline-flex", flexWrap: "wrap", gap: subtle ? 3 : 4, alignItems: "center" }}>
      {shown.map((b) => (
        <BadgeChip key={b.id} badge={b} size={size} compact subtle={subtle} />
      ))}
      {badges.length > max && (
        <span style={{ fontSize: 10, color: "hsla(0,0%,100%,0.45)" }}>+{badges.length - max}</span>
      )}
    </div>
  );
}
