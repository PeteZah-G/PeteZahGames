import { useEffect, useState, type ImgHTMLAttributes } from "react";

const KEY = [113, 55, 90, 120, 33, 57, 112, 76];

function enc(url: string): string {
  const input = encodeURIComponent(url);
  let bin = "";
  for (let i = 0; i < input.length; i++) {
    bin += String.fromCharCode(input.charCodeAt(i) ^ KEY[i % KEY.length]);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function coverSrc(url: string): string {
  let u = String(url || "").trim();
  if (!u) return "";
  if (u.includes("/!!/")) u = u.split("/!!/").join("/n/m/");
  if (u.startsWith("/f/c/") || u.startsWith("/!cover!/") || u.startsWith("data:") || u.startsWith("blob:")) return u;
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  if (!/^https?:\/\//i.test(u)) return u;
  try {
    return "/f/c/" + enc(u) + "/";
  } catch {
    return u;
  }
}

export function CoverImg({ src, onError, ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  const orig = String(src || "");
  const [cur, setCur] = useState(() => coverSrc(orig));
  useEffect(() => {
    setCur(coverSrc(orig));
  }, [orig]);
  return (
    <img
      {...rest}
      src={cur}
      onError={(e) => {
        if (orig && cur !== orig) {
          setCur(orig);
          return;
        }
        onError?.(e);
      }}
    />
  );
}
