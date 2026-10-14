## Agent skills

### Issue tracker

GitHub Issues on Xnogsis/larp.garden, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default roles, each label named after its role: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Site updates

For every user-facing feature or fix, update the Updates section in `home.html` in the same change. Add a short, plain-language note under the newest date first; group notes from the same day. Use dates in America/Los_Angeles. Record completed changes, not plans, internal maintenance, or routine automated catalog/comic refreshes. Preserve earlier entries.

## Local Celeste assets

Before testing Celeste locally, run `bash .github/scripts/prepare-celeste.sh` from the checkout. It downloads about 711 MiB of pinned runtime files into the ignored `celeste-assets/` directory and reuses completed downloads. Never commit these generated files. The Pages workflow prepares and caches the same assets before publishing.

For Snow Rider, run `bash .github/scripts/prepare-snow-rider.sh`; its generated files live in the ignored `snow-rider-assets/` directory and are also prepared by the Pages workflow.
