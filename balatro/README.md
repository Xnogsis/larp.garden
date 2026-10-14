# Balatro browser port

Balatro is by LocalThunk. This LÖVE/WebAssembly build was retrieved from
https://truffled.lol/games/balatro/ on October 14, 2026.

`game.js` and `game.data` use version `seedfix-20260813-v3`; `love.js` uses
`fs-bridge-v1`. The 10,636,382-byte `game.data` contains `game.love`.

All runtime files are committed here and published by Pages, so starting the
game requires no third-party requests. The page omits upstream analytics and
the missing clipboard helper, and makes the advertising callback a no-op.

Run `python3 tests/balatro.py` to check Home navigation, local loading,
WebAssembly startup, and saved filesystem persistence with external requests
blocked.
