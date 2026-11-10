# Game error reporting

Manual reports are available under **More → Report a game problem**. Automatic reports capture uncaught errors, rejected promises and loader failures while a game is open. Warnings and ordinary console output are excluded. Known optional advertising, analytics, account auto-login, and network-injected helper script failures remain in diagnostics without generating automatic reports; required game scripts still report failures. Visitors can disable automatic reporting in More; the choice persists on that browser.

Reports contain the game ID/name, a canonical game link, browser/graphics information and sanitized error details. Manual reports offer a description and a preview, with optional recent errors. Cookies, screenshots and saved-game storage are not collected. URL query strings/fragments and recognizable credential values are redacted. Automatic reports coalesce script and viewer errors and allow at most three distinct reports per browser in a 15-minute window. Failed deliveries do not interrupt gameplay or display the removed game error banner.

## Relay

- Sites project: `appgprj_6aee81b0258081919221b761b420e3ba`
- Origin: https://larp-game-reports-v7m4k2.cableddough.chatgpt.site
- Health: `/health`
- Browser session: `GET /v1/session`
- Reports: `POST /v1/report`
- Runtime secret name: `DISCORD_WEBHOOK_URL`

The Discord webhook is only stored in Sites runtime secrets. It must never be placed in this repository, browser configuration, error logs, CI variables printed to logs, or deployment archives. The frontend exposes only the relay address. The service permits the `https://larp.mom` browser origin, uses short-lived signed sessions bound to the connecting address, validates bounded payloads, prevents Discord mention pings, coalesces duplicates and honors delivery rate limiting. Address identifiers are HMAC-derived rather than sent to Discord.

Rate and duplicate counters use atomic D1 database statements shared across workers and regions. Only HMAC-derived identifiers, counts and expiry times are stored; expired entries are pruned in bounded batches. These limits are abuse controls for an anonymous reporting service, not authenticated visitor identities. Actual report content is delivered to Discord and is not stored by this relay.

## Maintenance and testing

Use Sites get_site and source credentials for the project above to maintain the private source repository. Update its runtime secret and redeploy to rotate the destination. The endpoint is public because the game site accepts anonymous visitors; there is no report-reading API.

Frontend reporting is disabled on localhost by default, so ordinary browser suites cannot send real reports. `tests/reporting.py` enables a mocked relay to verify manual reporting, duplicate suppression, opt-out, redaction and modal behavior. The relay's Node tests mock Discord. Run these checks before publishing relay changes. The public site deployment runs the frontend reporting suite along with the existing catalog and viewer checks.
