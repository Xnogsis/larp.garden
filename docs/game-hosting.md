# Catalog game hosting and release checks

The site is static GitHub Pages. Catalogs, viewer, service worker and many games currently share `larp.mom`. Game code has access to origin storage and surrounding pages. The disguise and about:blank launcher do not change that boundary.

## Reproducible catalog sources

`game-source-pins.js` records exact commits for the two catalog game repositories, the replacement-game repository, covers and catalog data. The worker imports these refs; the alternate launcher uses the same game commit. The worker’s mirrored catalog requests resolve fixed game commits instead of a moving `main` ref. Retry skips cached responses; choosing another source changes the mirror, not the pinned game version.

The daily catalog job snapshots the fork refs, builds the catalog and thumbnails from those exact refs, commits the pins with the catalog, then requests deployment. Fork synchronization alone cannot change the source used by the deployed worker. The Pages workflow runs deterministic catalog and viewer journeys plus local Balatro, Ruffle and TV checks before publication. A failing check blocks publication. Pins provide reproducibility, not a security audit of every game. Third-party assets referenced inside game HTML can still use moving URLs; the worker's existing rewrites and separately pinned local runtimes remain in effect.

## Separate game origin: remaining migration

Full isolation requires a separately hosted game origin. Do not treat `sandbox="allow-scripts allow-same-origin"` on a same-origin iframe as isolation: game scripts can remove that sandbox. Removing `allow-same-origin` globally would break origin storage, service workers and several runtimes.

Before enabling a separate origin:

1. Choose and provision a game host with HTTPS and its own service-worker scope, independent from the catalog origin. GitHub project Pages can inherit a custom domain, so verify the final URL really has a different origin.
2. Move the worker, local runtime paths and required assets together. Validate root-relative URL rewrites, MIME types, fullscreen, audio, gamepad and cross-origin resource policies.
3. Offer explicit save export/import for game-specific IndexedDB/localStorage and test restoring existing saves. Browser origin storage cannot be moved automatically across domains.
4. Replace same-origin diagnostics access with narrowly scoped `postMessage` events, verifying both `event.origin` and `event.source`. Keep catalog navigation and recent-game records on the catalog origin.
5. Exercise representative Unity, WASM, Flash and single-file games, then enable the isolated host. Keep a documented rollback and save-recovery path.

This change does not provision another host or claim full game isolation. It pins the code supplied by catalog repositories and puts browser regression checks before deployment while preserving current saves.
