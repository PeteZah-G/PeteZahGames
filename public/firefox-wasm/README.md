# Firefox WASM (vendored)

Large `.zst` binaries are gitignored. After pull on the VPS:

```bash
npm run vendor:firefox-wasm
pm2 restart PeteZahGames
```

The vendor script downloads `chrome-demo-v0.0.1.tar.gz` (resolved via GitHub API), patches Wisp/start URL, restores PeteZah shell UI, and syncs into `dist/firefox-wasm` when `dist/` exists.

If nginx uses `try_files … /index.html`, missing `/firefox-wasm/*` files will return HTML and break CSS. Make sure vendor succeeded (`chrome-assets.tar.zst` and `gecko.wasm.zst` must exist under `public/firefox-wasm/`).

Sources:
- https://developer.puter.com/labs/firefox-wasm/
- https://github.com/HeyPuter/firefox-wasm

Default network: Virginia Wisp `/api/alt-wisp-3/`.
