Everything in this directory is completely credited to waves, original source at https://github.com/enniuu/waves/tree/prod/mochi

This is a more primitive proxy, that is better for game assets, written in rust.

love u :D

## Production

Always run the **release** binary on the VPS (debug burns ~10–15% CPU for free):

```bash
cd backend/mochi
cargo build --release
# point your process manager at:
#   backend/mochi/target/release/mochi
```

Do not run `target/debug/mochi` in production.