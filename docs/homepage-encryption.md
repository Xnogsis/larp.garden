# Homepage encryption

PageCrypt encrypts only the homepage. The public `/` and `/home.html` show the same password form. Unlocking `/` or `/index.html` opens Games by default; visiting `/home.html` opens Home. The game catalogs and direct game links remain public. Old saved-page cookies cannot bypass the password screen. PageCrypt remembers the decryption key in session storage for reloads in that tab; the homepage's “Forget my saved page” button clears it.

Edit `home.html` normally. `index.html` is the password-screen template. After changing either, install the pinned dependency with `npm ci --ignore-scripts`, supply the existing password through `PAGECRYPT_PASSWORD`, and run `node .github/scripts/encrypt-home.mjs`. Commit `.github/encrypted-home.html` with the source changes. The password is never written to the artifact or repository. `node .github/scripts/encrypt-home.mjs --check` verifies the artifact matches the current source.

Deployment checks the source and encrypted entry flow, then copies the encrypted artifact over both `index.html` and `home.html` before uploading. The `.github` directory is excluded by `upload-pages-artifact`; it is not a public plaintext homepage URL. The original source remains available in this public GitHub repository. Homepage encryption does not make the game library or repository private.
