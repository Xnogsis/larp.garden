# Polytrack local build

Polytrack is by Kodub. These files come from `bubblfan/polytrack` at commit
`feb7f045e85fdf07e0d7f7e6d0f08984b9fe20d6`.

The page's base URL uses `/polytrack/`. The worker imports Ammo relative to its
own URL, without the extra asset prefix needed by the old Blob worker.
The asynchronous Blob-worker wrapper was removed: it could pass
`undefined` to the Worker constructor before its download completed. Workers
now use the native same-origin constructor and load matching local Ammo files.
The upstream API URL handling is preserved; online services remain external.

Run `python3 tests/polytrack.py` to check worker startup and an official race
with third-party requests blocked and worker downloads deliberately delayed.
