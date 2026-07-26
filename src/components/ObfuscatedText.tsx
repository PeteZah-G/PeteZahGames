import { useEffect, useState, type CSSProperties, type ElementType, type ReactNode } from "react";
import {
  getFontMaps,
  loadFontMaps,
  obfuscateDisplayText,
  shouldObfuscateDisplay,
} from "@/lib/fontObfuscation";

export default function ObfuscatedText({
  children,
  className,
  style,
  as: Tag = "span",
}: {
  children: string;
  className?: string;
  style?: CSSProperties;
  as?: ElementType;
}) {
  const needs = shouldObfuscateDisplay(children);
  const [text, setText] = useState(children);

  useEffect(() => {
    if (!needs) {
      setText(children);
      return;
    }
    let alive = true;
    loadFontMaps().then(() => {
      if (!alive) return;
      const { maps } = getFontMaps();
      setText(maps ? obfuscateDisplayText(children, maps) : children);
    });
    return () => {
      alive = false;
    };
  }, [children, needs]);

  return (
    <Tag
      className={needs ? `ob-p${className ? ` ${className}` : ""}` : className}
      style={style}
      data-no-obfuscate={needs ? "true" : undefined}
    >
      {text as ReactNode}
    </Tag>
  );
}
