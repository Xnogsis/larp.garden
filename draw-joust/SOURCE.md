Draw Joust web build from `genizy/brainrot`, commit
`62d9ad5dc24b75038d4effe4f7e2cb889eb7b886`, directory `draw-joust/`.

The gn-math entry referenced a malformed CDN URL and a missing repository.
This copy serves the Unity build, styles, and images locally. Removed the remote
base URL and an icon link whose target was absent from the source build.
Updated the Unity framework's legacy WebGL input callbacks to call its current
`dynCall` function directly; the obsolete `Runtime` global caused focus errors.

`platform.js` provides guest initialization and local save data for the export's
Yandex bridge. Yandex login, purchases, ads, reviews, and online leaderboards are
unavailable here. Built-in Unity GameAnalytics requests are optional; the browser
test blocks external requests and verifies that the game still starts.
