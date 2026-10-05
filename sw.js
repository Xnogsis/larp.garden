// Serves /hub/<slug>/... straight out of GitHub repos via public CDNs, so
// whole static game sites run under this origin with proper MIME types.
// `repos` lists equivalent copies (upstream + forks), tried in order.
//
// Trust boundary: every repo listed here ships HTML and JS that runs as first-party
// code on this origin (same cookies, storage, caches). Only add repos whose owners
// are trusted; a malicious commit upstream is a malicious commit here. HUB_CSP below
// narrows what such a page can do, but cannot isolate it from the origin.
const HUBS = {
    umbrion:    { repos: ["EclipsarGames/Umbrion"],        branch: "main" },
    dotgui:     { repos: ["DotLYHiyou/DotGUI"],            branch: "main" },
    projecthub: { repos: ["IamChristianS/Project-HUB_V3"], branch: "main" },
    cherri:     { repos: ["x8rr/cherri"],                  branch: "main" },
    duckmath:   { repos: ["Neruvy/duckmath"],              branch: "main" },
    lite3kh0:   { repos: ["3kh0/3kh0-lite"],               branch: "main" },
    cmx:        { repos: ["hackz00/classroommaxxing"],     branch: "main" },
    artclass:   { repos: ["proudparrot2/artclass-v2"],     branch: "main" },
    // gn-math's own org is blocked on jsDelivr, so the up-to-date fork goes first.
    gnmath:     { repos: ["freebuisness/html", "gn-math/html"], branch: "main" },
    // Site owner's forks of the three gn-math repos; the game pages inside still point
    // their assets at freebuisness/gn-math, so those URLs get redirected (see REWRITE).
    gnmirror:   { repos: ["Xnogsis/html"], branch: "main", owner: "Xnogsis" },
    // Same repos as gnmath but everything goes through esm.sh, including the jsDelivr
    // URLs the game pages request themselves, for networks that block jsDelivr.
    // esm.sh reads from GitHub, so games whose upstream repo is gone get a live copy instead.
    gnesm:      { repos: ["freebuisness/html", "gn-math/html", "3kh0/3kh0-lite"], branch: "main", esm: true,
                  pages: { "96.html": "projects/motox3m/index.html" } },
};

// Any GitHub (/gh/) or npm (/npm/) file on a jsDelivr edge. esm.sh serves GitHub files
// under /gh/ with the same "repo@ref/path" layout and npm files at the root as
// "pkg@ver/path". "?raw" stops esm.sh from turning .js files into ES modules.
const JSDELIVR_RE = /^https:\/\/(?:cdn|gcore|fastly|testingcf)\.jsdelivr\.net\/(gh|npm)\/([^?#]+)(\?[^#]*)?/;
function viaEsm(href) {
    const m = JSDELIVR_RE.exec(href);
    if (!m) return href;
    return "https://esm.sh/" + (m[1] === "gh" ? "gh/" : "") + m[2] + (m[3] ? m[3] + "&raw" : "?raw");
}

// Cross-origin URLs that a hub's pages request and that should come from that hub's
// own copy instead. Only gn-math style hubs need this, for their assets/covers/html repos.
const UPSTREAM_RE = /https:\/\/(?:cdn|gcore)\.jsdelivr\.net\/gh\/(?:freebuisness|gn-math)\/(assets|covers|html)@main\//g;
function rewriteUpstream(slug, text) {
    const owner = HUBS[slug] && HUBS[slug].owner;
    if (!owner) return text;
    return text.replace(UPSTREAM_RE, (_, repo) => `https://cdn.jsdelivr.net/gh/${owner}/${repo}@main/`);
}

// bubbls/youtube-playables' ytgame.js is the real YouTube Playables SDK, which
// waits on a YouTube host that never exists here: getLanguage() pends forever,
// so game wrappers stall on a black screen before loading their scripts. Its
// tail also fetches location.orgin+"/pages/home.html" (typo for origin), which
// resolves to <game>/undefined/pages/home.html and 404s. The stub mirrors the
// real SDK's offline behavior (loadData resolves "", isAudioEnabled is sync,
// getLanguage falls back to "en"); unlisted members resolve to a no-op that
// returns a resolved promise so callers can invoke them unconditionally.
const YTGAME_RE = /^\/gh\/bubbls\/youtube-playables@[^/]+\/ytgame\.js$/;
const YTGAME_STUB = `'use strict';
window.ytgame = (() => {
    const res = (v) => Promise.resolve(v);
    const noop = () => {};
    const wrap = (o) => new Proxy(o, { get(t, k) {
        if (k in t) return t[k];
        if (typeof k === "symbol" || k === "then" || k === "catch" || k === "finally") return undefined;
        return (t[k] = wrap(function () { return res(undefined); }));
    } });
    return wrap({
        SDK_VERSION: "stub",
        IN_PLAYABLES_ENV: false,
        SdkError: class extends Error {},
        SdkErrorType: {},
        system: wrap({
            getLanguage: () => res((navigator.language || "en").split("-")[0]),
            isAudioEnabled: () => true,
            onAudioEnabledChange: noop,
        }),
        game: wrap({
            firstFrameReady: noop,
            gameReady: noop,
            loadData: () => res(""),
            saveData: () => res(),
        }),
        health: wrap({ logError: noop, logWarning: noop }),
        engagement: wrap({ sendScore: () => res(), openYTContent: noop, share: () => res() }),
        ads: wrap({}),
    });
})();`;

// Some Construct 3 games (Basket Random, Boxing Random, ...) load their engine from a
// Weebly upload in which every requestAnimationFrame was renamed cancelAnimationFrame,
// so the runtime draws its first frame and never ticks again: the game sits on its
// PLAY screen everywhere, ads or not. Real cancel calls are statements; a call whose
// result is stored ("x = " / "set(k, ") can only have been a request, so those get
// their name back.
const BROKEN_C3_RE = /^https:\/\/[^/]+\.preview\.editmysite\.com\/.+\/c3runtime\.js$/;
const BROKEN_C3_RAF_RE = /([=,](?:self\.)?)cancelAnimationFrame\(/g;
async function fixedC3Runtime(request) {
    const res = await fetch(request.url, { mode: "cors" });
    if (!res.ok) return res;
    const body = (await res.text()).replace(BROKEN_C3_RAF_RE, "$1requestAnimationFrame(");
    return new Response(body, { headers: { "Content-Type": "text/javascript", "Cache-Control": "public, max-age=86400" } });
}

// Same-site front for jsDelivr (cdn-worker.js). Managed networks (schools, offices)
// often block jsDelivr and GitHub outright but let anything under this site's own
// domain through. It goes last: filter proxies answer it with their own 404 while it
// is not deployed, and a 404 ends the hedged round before the real mirrors are tried.
const SAME_SITE_CDN = "https://cdn.larp.garden";
const viaSameSite = (href) => href.replace(/^https:\/\/[a-z]+\.jsdelivr\.net/, SAME_SITE_CDN);

const ESM_MIRROR = (r, b, p) => viaEsm(`https://cdn.jsdelivr.net/gh/${r}@${b}/${p}`);
const MIRRORS = [
    (r, b, p) => `https://cdn.jsdelivr.net/gh/${r}@${b}/${p}`,
    (r, b, p) => `https://gcore.jsdelivr.net/gh/${r}@${b}/${p}`,
    (r, b, p) => `https://fastly.jsdelivr.net/gh/${r}@${b}/${p}`,
    (r, b, p) => `https://testingcf.jsdelivr.net/gh/${r}@${b}/${p}`,
    (r, b, p) => `https://raw.githubusercontent.com/${r}/${b}/${p}`,
    (r, b, p) => `https://cdn.statically.io/gh/${r}/${b}/${p}`,
    (r, b, p) => `${SAME_SITE_CDN}/gh/${r}@${b}/${p}`,
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

// Hub pages are only meant to live inside this site's iframe; opened as the top
// window they would show the hub path in the address bar, so bounce to the 404
// page (the saved cookie reopens the hub properly from there).
const UNFRAME_QUERY = "?unframed";
// It also hands the page's window to the catalog's debug panel (gnmath.js lgDebug), if the parent has one.
const STAY_FRAMED = '<script>if(top===self)location.replace("/' + UNFRAME_QUERY + '");try{parent.lgDebug&&parent.lgDebug(window)}catch(e){}</script>';
// Synchronous XHRs bypass the service worker, so esm hubs reroute those in the page.
const ESM_SYNC_XHR = `<script>(()=>{const JSDELIVR_RE=${JSDELIVR_RE};const viaEsm=${viaEsm};const open=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u,a,...r){if(a===false)u=viaEsm(new URL(u,document.baseURI).href);return open.call(this,m,u,a,...r)}})()</script>`;

// Sent with every hub HTML page. Hub games need inline scripts, eval and CDN assets,
// so script/connect sources stay open; this pins down the rest: pages can only be
// framed by this site, can only retarget relative URLs with <base> at the CDNs the
// games are served from anyway (gn-math pages do this for games hosted in other
// repos), cannot pull workers or service workers from other origins, and cannot mix
// in plain http.
const HUB_CSP = "frame-ancestors 'self'; base-uri 'self' https://*.jsdelivr.net https://esm.sh https://raw.githubusercontent.com https://cdn.statically.io; worker-src 'self' blob:; upgrade-insecure-requests";

// Give up on a mirror that has not answered with headers after this long.
const MIRROR_TIMEOUT_MS = 8000;
// Copies are hedged: the next one in preference order starts this long after the
// previous (or as soon as the previous fails), and the first success wins, so a
// hanging host costs at most this much.
const HEDGE_DELAY_MS = 1500;
// The mirror that answered most recently goes first for later requests.
let preferredMirror = 0;
// Whether the same-site front answered a page's own CDN request more recently than jsDelivr did.
let preferSameSite = false;

function fetchWithTimeout(url, init, ctl) {
    const timer = setTimeout(() => ctl.abort(), MIRROR_TIMEOUT_MS);
    return fetch(url, { ...init, referrerPolicy: "no-referrer", signal: ctl.signal }).finally(() => clearTimeout(timer));
}

// Resolves with the first usable Response from any of the equivalent URLs and the index
// that won, or with the status they settled on. A clean 404 means the file does not
// exist and the other copies would say the same, so it ends the round early.
function hedged(urls, init) {
    return new Promise((resolve) => {
        const timers = [];
        const controllers = [];
        let pending = urls.length;
        let lastStatus = 502;
        let done = false;
        const tried = [];
        const settle = (res, index) => {
            if (done) return;
            done = true;
            timers.forEach(clearTimeout);
            controllers.forEach((c) => { if (!res || c !== res.ctl) c.abort(); });
            resolve({ res: res ? res.res : { status: lastStatus }, index, tried });
        };
        const start = async (i) => {
            if (done || timers[i] === null) return;
            clearTimeout(timers[i]);
            timers[i] = null;
            const ctl = new AbortController();
            controllers.push(ctl);
            try {
                const res = await fetchWithTimeout(urls[i], init, ctl);
                tried.push(res.status + " " + urls[i]);
                if (res.ok || res.type === "opaque") return settle({ res, ctl }, i);
                lastStatus = res.status;
                if (res.status === 404) return settle(null, -1);
            } catch (e) { tried.push(e.name + " " + urls[i]); }
            if (--pending === 0) settle(null, -1);
            else if (i + 1 < urls.length) start(i + 1);
        };
        urls.forEach((_, i) => timers.push(setTimeout(start, i * HEDGE_DELAY_MS, i)));
    });
}

async function fromMirrors(slug, path) {
    const { repos, branch, owner, esm, pages } = HUBS[slug];
    if (pages && pages[path]) return Response.redirect("/hub/" + slug + "/" + pages[path], 302);
    // The owner's own forks change when they sync them; do not pin those for a day.
    const cache = owner ? "default" : "force-cache";
    const mirrors = esm ? [ESM_MIRROR] : MIRRORS;
    let lastStatus = 502;
    const tried = [];
    for (const repo of repos) {
        const order = mirrors.slice(preferredMirror).concat(mirrors.slice(0, preferredMirror));
        const { res, index, tried: t } = await hedged(order.map((build) => build(repo, branch, path)), { cache });
        tried.push(...t);
        if (res.ok) {
            preferredMirror = mirrors.indexOf(order[index]);
            const headers = new Headers();
            const mime = mimeFor(path) || res.headers.get("content-type") || "application/octet-stream";
            headers.set("Content-Type", mime);
            headers.set("Cache-Control", owner ? "public, max-age=3600" : "public, max-age=86400");
            let body = res.body;
            if (mime === "text/html") {
                headers.set("Content-Security-Policy", HUB_CSP);
                headers.set("X-Content-Type-Options", "nosniff");
                // Hub pages must keep sending a full referrer, or their root-relative
                // links can't be routed back to the hub.
                body = rewriteUpstream(slug, (await res.text()).replace(/<meta\s+name=["']?referrer["']?[^>]*>/gi, ""));
                // Draw Climber's egret build draws nothing on some WebGL/ANGLE drivers
                // (black canvas, no errors). Its 2D canvas renderer paints correctly.
                if (body.includes("yrgen73/draw-cl")) {
                    body = body.replace(/renderMode:\s*"webgl"/g, 'renderMode: "canvas"');
                }
                const inject = esm ? STAY_FRAMED + ESM_SYNC_XHR : STAY_FRAMED;
                body = /<head[^>]*>/i.test(body)
                    ? body.replace(/<head[^>]*>/i, (tag) => tag + inject)
                    : body.replace(/^(\s*<!doctype[^>]*>)?/i, (doctype) => doctype + inject);
            }
            return new Response(body, { status: 200, headers });
        }
        lastStatus = res.status;
    }
    // Listed so a user without devtools can paste which mirror answered what (AbortError = cut off or timed out).
    return new Response("Not found: " + slug + "/" + path + "\n\n" + tried.join("\n"), { status: lastStatus, headers: { "Content-Type": "text/plain" } });
}

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== "GET") return;

    // Game scripts build asset URLs at runtime too, so upstream requests from a
    // hub with its own copy are pointed at that copy (the HTML was rewritten already).
    if (url.origin !== self.location.origin) {
        if (BROKEN_C3_RE.test(url.href)) {
            event.respondWith(fixedC3Runtime(event.request).catch(() => fetch(event.request)));
            return;
        }
        if (!JSDELIVR_RE.test(url.href)) return;
        if (YTGAME_RE.test(url.pathname)) {
            event.respondWith(new Response(YTGAME_STUB, {
                headers: { "Content-Type": "text/javascript", "Cache-Control": "public, max-age=86400" },
            }));
            return;
        }
        event.respondWith((async () => {
            const slug = await hubFromClient(event);
            const target = slug ? rewriteUpstream(slug, url.href) : url.href;
            const req = event.request;
            const init = req.mode === "navigate"
                ? {}
                : { mode: req.mode, credentials: req.credentials, headers: req.headers, redirect: req.redirect };
            if (slug && HUBS[slug].esm) {
                try {
                    const res = await fetch(viaEsm(target), init);
                    if (res.ok || res.type === "opaque") return res;
                } catch (_) { /* fall back to the original */ }
                return fetch(req);
            }
            const urls = preferSameSite ? [viaSameSite(target), target] : [target, viaSameSite(target)];
            const { res, index } = await hedged(urls, init);
            if (!(res instanceof Response)) return fetch(req);
            preferSameSite = urls[index] !== target;
            return res;
        })());
        return;
    }

    const direct = parseHubPath(url.pathname);
    if (direct) {
        event.respondWith(fromMirrors(direct.slug, direct.path));
        return;
    }

    if (url.pathname === "/sw.js") return;
    // The bounce out of a top-level hub page carries a hub referrer; it must reach the real 404 page.
    if (event.request.mode === "navigate" && url.search === UNFRAME_QUERY) return;

    event.respondWith((async () => {
        const slug = await hubFromClient(event);
        if (!slug) return fetch(event.request);
        // A "../" from a hub's root page climbs out to "/hub/x"; on the real site the
        // browser would have clamped it at the root, so drop the stray "hub" segment.
        const path = url.pathname.replace(/^\/(hub\/)?/, "");
        if (event.request.mode === "navigate") {
            return Response.redirect("/hub/" + slug + "/" + path + url.search + url.hash, 302);
        }
        return fromMirrors(slug, path);
    })());
});
