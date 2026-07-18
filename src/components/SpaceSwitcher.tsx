import { motion } from "framer-motion";
import { Space } from "@/hooks/useBrowserState";

interface SpaceSwitcherProps {
  spaces: Space[];
  activeSpaceId: string;
  onSwitch: (id: string) => void;
  collapsed?: boolean;
}

export default function SpaceSwitcher({ spaces, activeSpaceId, onSwitch, collapsed }: SpaceSwitcherProps) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-2">
        {spaces.map((space) => {
          const isActive = space.id === activeSpaceId;
          return (
            <button
              key={space.id}
              onClick={() => onSwitch(space.id)}
              className="relative w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200"
            >
              {isActive && (
                <motion.div
                  layoutId="space-dot-collapsed"
                  className="absolute inset-0 rounded-lg glass"
                  transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
                />
              )}
              <div
                className="relative z-10 w-2 h-2 rounded-full transition-all"
                style={{
                  background: `hsl(${space.color})`,
                  opacity: isActive ? 1 : 0.4,
                  transform: isActive ? "scale(1.2)" : "scale(1)",
                }}
              />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 px-3 py-3">
      {spaces.map((space) => {
        const isActive = space.id === activeSpaceId;
        return (
          <button
            key={space.id}
            onClick={() => onSwitch(space.id)}
            className="relative flex-1 py-2 rounded-lg text-xs font-medium transition-all duration-200"
            style={{ color: isActive ? `hsl(${space.color})` : undefined }}
          >
            {isActive && (
              <motion.div
                layoutId="space-indicator"
                className="absolute inset-0 rounded-lg glass"
                transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
              />
            )}
            <span className="relative z-10 text-[11px] tracking-wide">
              {space.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
