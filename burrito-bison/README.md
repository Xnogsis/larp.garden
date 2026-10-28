# Burrito Bison loader files

These files come from `bubbls/UGS-Assets`, commit
`9cf433220236bb0471ab3a68ec8fe3e0a2799e36`, directory `BurritoBison-main/`.
The game is Burrito Bison: Launcha Libre by Juicy Beast.

The service worker serves the loader scripts, configuration and CSS locally;
opaque CDN script responses otherwise fail with 403 before Unity can start.
The stylesheet's image paths are corrected from `../images/` to `images/`.
Large split game files remain CDN-backed, pinned to the matching revision.
The hub's XMLHttpRequest wrapper also preserves the native async default when
the third argument to `open()` is omitted; Unity's binary downloads require it.

`tests/fixtures/burrito-bison.html` captures the existing UGS entry point.
`python3 tests/burrito_bison.py` downloads hash-verified runtime parts into a
temporary cache and boots the actual Unity runtime while rejecting external
script downloads. The test needs network access on the first run.
