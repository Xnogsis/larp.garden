# Custom domain: larp.surf

The site uses GitHub Pages with a custom Actions deployment. The GitHub repository
is still `Xnogsis/larp.garden`; repository URLs and CDN references to that repository
must keep their existing name.

## DNS

At the DNS provider for `larp.surf`, configure:

| Type | Name | Value |
| --- | --- | --- |
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | xnogsis.github.io |

These are GitHub Pages' IPv4 addresses. The `www` record points to the GitHub
account hostname, without a repository path. Remove conflicting records at these
names. The apex does not need an AAAA or CNAME record for this setup.

## GitHub Pages and HTTPS

After DNS resolves correctly, set the repository's **Settings → Pages → Custom
domain** to `larp.surf`. Wait for GitHub's certificate to cover `larp.surf` and
`www.larp.surf`, then ensure **Enforce HTTPS** is enabled. The repository's `CNAME`
file records the intended domain; with this Actions deployment it does not replace
the Pages custom-domain setting.

Update the repository's website URL to `https://larp.surf/`. No repository rename
is needed. The deployment workflow already takes its verification URLs from the
Pages deployment output, so its asset checks follow the configured domain.

## Verification

Check the HTTPS root, `/home.html`, `/gnmath.html`, `/ugs.html`, and `/sw.js` on the
new hostname. Verify the `www` and HTTP redirects, certificate validity, navigation,
and a locally hosted game through its `/hub/gnmath/` URL. The loader uses the current
origin for worker scope, game redirects, and assets; no old site hostname should be
needed to play local games.

Browser cookies, settings, and game saves belong to their original hostname.
Changing domains does not move that storage. Export saves using each game's export
feature before switching if those saves need to be carried across.
