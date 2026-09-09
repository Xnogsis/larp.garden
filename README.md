# larp.garden

Static site. Deployed two ways:

- **GitHub Pages** – `.github/workflows/static.yml` publishes `main` as-is.
- **Self-hosted behind [Anubis](https://anubis.techaro.lol/)** – blocks AI scrapers / bots with a proof-of-work
  challenge before anyone reaches the HTML. GitHub Pages can't run Anubis, so this needs any small Linux box with Docker.

## Deploy with Anubis

```sh
git clone https://github.com/Xnogsis/larp.garden.git && cd larp.garden
cp .env.example .env        # set DOMAIN=larp.garden (DNS must point at this server)
docker compose up -d
```

Caddy gets a TLS cert automatically and proxies to Anubis, which challenges visitors and then forwards to
nginx serving this repo's files. Updating the site is just `git pull` — no rebuild.

- Bot rules: `deploy/botPolicy.yaml`
- Challenge difficulty / contact email: `.env`
- Local test: `DOMAIN=http://localhost docker compose up` then open http://localhost
