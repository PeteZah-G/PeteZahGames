# Firefox WASM (vendored)

Large `.zst` binaries are gitignored. JS/CSS under `assets/` and PeteZah shell files are tracked.

After clone / on deploy:

```bash
npm run vendor:firefox-wasm
```

That refreshes Gecko binaries and re-applies patches. Shell UI (`index.html`, `pete-vm.css`, `thanks.html`) comes from `scripts/templates/`.

If nginx uses `try_files … /index.html`, missing `/firefox-wasm/assets/*` will return HTML and break CSS MIME checks. Deploy the assets folder (or run vendor before build) so those files exist on disk.

Sources:
- https://developer.puter.com/labs/firefox-wasm/
- https://github.com/HeyPuter/firefox-wasm

Default network: Virginia Wisp `/api/alt-wisp-3/` (override in Advanced options).
