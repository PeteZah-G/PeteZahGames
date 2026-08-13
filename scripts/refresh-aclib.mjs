#!/usr/bin/env node
import { createWriteStream, existsSync, mkdirSync, renameSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "public", "vendor", "pz-media-kit.js");
const tmp = `${dest}.tmp`;
const urls = [
  "https://acscdn.com/script/aclib.js",
  "https://adbpage.com/adblock?v=3&format=js",
];

async function pull(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: "*/*",
      Referer: "https://www.adcash.com/",
    },
  });
  if (!res.ok || !res.body) throw new Error(`${res.status} ${url}`);
  mkdirSync(path.dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  renameSync(tmp, dest);
  console.log("Wrote", dest, "from", url);
}

let last = null;
for (const url of urls) {
  try {
    await pull(url);
    process.exit(0);
  } catch (e) {
    last = e;
    console.warn("Failed", url, e.message || e);
  }
}
if (!existsSync(dest)) {
  console.error("Could not refresh aclib", last?.message || last);
  process.exit(1);
}
console.warn("Kept existing vendor copy");
process.exit(0);
