import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public/storage/data/collection.json");
const FILE_EXT = /\.[a-z0-9]{1,8}$/i;

function needsIndex(httpUrl) {
  try {
    const u = new URL(httpUrl);
    const last = u.pathname.split("/").filter(Boolean).pop() || "";
    if (FILE_EXT.test(last)) return false;
    return true;
  } catch {
    return false;
  }
}

function addIndex(httpUrl) {
  const u = new URL(httpUrl);
  if (!u.pathname.endsWith("/")) u.pathname += "/";
  if (!u.pathname.endsWith("index.html")) u.pathname += "index.html";
  return u.toString();
}

function fixPlayUrl(url) {
  if (typeof url !== "string") return url;
  for (const prefix of ["/!!/", "/n/m/"]) {
    const i = url.indexOf(prefix);
    if (i === -1) continue;
    const rest = url.slice(i + prefix.length);
    if (!/^https?:\/\//i.test(rest)) continue;
    if (!needsIndex(rest)) return url;
    return url.slice(0, i) + prefix + addIndex(rest);
  }
  return url;
}

const data = JSON.parse(fs.readFileSync(file, "utf8"));
let n = 0;
for (const game of data.games || []) {
  const next = fixPlayUrl(game.url);
  if (next !== game.url) {
    game.url = next;
    n++;
  }
}
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
console.log("updated", n, "play urls");
