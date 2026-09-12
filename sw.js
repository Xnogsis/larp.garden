// Serves /hub/<slug>/... straight out of GitHub repos via public CDNs, so
// whole static game sites run under this origin with proper MIME types.
// `repos` lists equivalent copies (upstream + forks), tried in order.
const HUBS = {
    umbrion:    { repos: ["EclipsarGames/Umbrion"],        branch: "main" },
    dotgui:     { repos: ["DotLYHiyou/DotGUI"],            branch: "main" },
    projecthub: { repos: ["IamChristianS/Project-HUB_V3"], branch: "main" },
    cherri:     { repos: ["x8rr/cherri"],                  branch: "main" },
    duckmath:   { repos: ["Neruvy/duckmath"],              branch: "main" },
    lite3kh0:   { repos: ["3kh0/3kh0-lite"],               branch: "main" },
    // gn-math's own org is blocked on jsDelivr, so the up-to-date fork goes first.
    gnmath:     { repos: ["freebuisness/html", "gn-math/html"], branch: "main" },
};

const MIRRORS = [
    (r, b, p) => `https://cdn.jsdelivr.net/gh/${r}@${b}/${p}`,
    (r, b, p) => `https://gcore.jsdelivr.net/gh/${r}@${b}/${p}`,
    (r, b, p) => `https://raw.githubusercontent.com/${r}/${b}/${p}`,
    (r, b, p) => `https://cdn.statically.io/gh/${r}/${b}/${p}`,
];

const MIME = {
    html: "text/html", htm: "text/html", js: "text/javascript", mjs: "text/javascript",
    css: "text/css", json: "application/json", wasm: "application/wasm", svg: "image/svg+xml",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
    ico: "image/x-icon", mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", mp4: "video/mp4",
    webm: "video/webm", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
    txt: "text/plain", xml: "text/xml", pdf: "application/pdf", swf: "application/x-shockwave-flash",
    data: "application/octet-stream", unityweb: "application/octet-stream", bin: "application/octet-stream",
};

const HUB_RE = /^\/hub\/([^/]+)\/?(.*)$/;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

function parseHubPath(pathname) {
    const m = HUB_RE.exec(pathname);
    if (!m || !HUBS[m[1]]) return null;
    let path = m[2];
    if (path === "" || path.endsWith("/")) path += "index.html";
    return { slug: m[1], path };
}

// Root-relative requests ("/js/main.js") coming from a hub page belong to that hub.
async function hubFromClient(event) {
    if (event.request.referrer) {
        const m = HUB_RE.exec(new URL(event.request.referrer).pathname);
        if (m && HUBS[m[1]]) return m[1];
    }
    // Looking up resultingClientId during a navigation deadlocks; only subresources get here.
    if (event.request.mode !== "navigate" && event.clientId) {
        const client = await self.clients.get(event.clientId);
        if (client) {
            const m = HUB_RE.exec(new URL(client.url).pathname);
            if (m && HUBS[m[1]]) return m[1];
        }
    }
    return null;
}

function mimeFor(path) {
    const ext = path.split("?")[0].split(".").pop().toLowerCase();
    return MIME[ext] || null;
}

async function fromMirrors(slug, path) {
    const { repos, branch } = HUBS[slug];
    let lastStatus = 502;
    for (const repo of repos) {
        for (const build of MIRRORS) {
            try {
                const res = await fetch(build(repo, branch, path), { cache: "force-cache" });
                if (res.ok) {
                    const headers = new Headers();
                    const mime = mimeFor(path) || res.headers.get("content-type") || "application/octet-stream";
                    headers.set("Content-Type", mime);
                    headers.set("Cache-Control", "public, max-age=86400");
                    // Hub pages must keep sending a full referrer, or their root-relative
                    // links can't be routed back to the hub.
                    const body = mime === "text/html"
                        ? (await res.text()).replace(/<meta\s+name=["']?referrer["']?[^>]*>/gi, "")
                        : res.body;
                    return new Response(body, { status: 200, headers });
                }
                lastStatus = res.status;
            } catch (_) { /* try next mirror */ }
        }
    }
    return new Response("Not found: " + slug + "/" + path, { status: lastStatus, headers: { "Content-Type": "text/plain" } });
}

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin || event.request.method !== "GET") return;

    const direct = parseHubPath(url.pathname);
    if (direct) {
        event.respondWith(fromMirrors(direct.slug, direct.path));
        return;
    }

    if (url.pathname === "/sw.js") return;

    event.respondWith((async () => {
        const slug = await hubFromClient(event);
        if (!slug) return fetch(event.request);
        if (event.request.mode === "navigate") {
            return Response.redirect("/hub/" + slug + url.pathname + url.search + url.hash, 302);
        }
        return fromMirrors(slug, url.pathname.replace(/^\//, ""));
    })());
});
