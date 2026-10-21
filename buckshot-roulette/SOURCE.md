Buckshot Roulette by Mike Klubnika.

Web export from `giorgirick2-gif/game-webports-onawebsite`, commit
`b3042ae7a56b2ede39ea4b4371b1d0ab3af8828a`, directory `buckshot-roulette/`.

The page starts Godot directly with its normal download progress instead of
waiting for a separate script to merge 20 CDN files. The engine's initialization
promise now propagates download/initialization failures to the page's error notice.

Run `python3 .github/scripts/prepare-buckshot.py` before local testing. The helper
assembles and compresses the pinned WASM/data parts into ignored `buckshot-assets/`.
The root service worker serves these files locally, decompressing their streams.
The Pages workflow prepares and caches the same assets before publishing.
