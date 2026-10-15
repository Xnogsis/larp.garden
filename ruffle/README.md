# Local Flash runtimes

`0.2.0-nightly.2025.10.2/` is the official `@ruffle-rs/ruffle` npm package,
downloaded from registry.npmjs.org and verified against its published integrity:

```
sha512-F0+By88Hng5sY+TJdD0jmJSY+ADAqwaaq/jhLYV89DRaMYd1sKQ6M/U7eBgFUfPiJvK98yBQhGwMHUCZgLs2bg==
```

The package contains both WASM variants and their matching JavaScript chunks.
The worker serves encrypted upstream requests for `ruffle.min.js` using the
package's `ruffle.js`, and serves the chunks locally. Plaintext runtime paths
and `publicPath` settings in game HTML are rewritten to this directory too.
Keep the JavaScript and WASM files from the same package together.

`standalone-113/` is the Ruffle player from `Xnogsis/assets/113` at commit
`086917e3a6808714a0ecee3bb72eecf2512a94a7`. Its page uses a local base URL,
omits the missing icon180.png, and connects to the site's debug panel.
Ruffle's MIT and Apache licenses are included in the npm directory.

Run `python3 tests/ruffle.py` for Chromium, or `python3 tests/ruffle.py --firefox`
after installing Playwright's Firefox. These exercise the real local WASM and
SWF through the worker, including dynamically constructed CDN URLs, legacy
embeds, the rewritten publicPath, and the standalone module build. External
network requests from the worker fail the test.
