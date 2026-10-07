// Serves /hub/gnmath/... straight out of gn-math's GitHub repos via esm.sh (or jsDelivr),
// so the whole static game site runs under this origin with proper MIME types.
// REPOS lists equivalent copies (upstream + forks), tried in order.
//
// Trust boundary: every repo listed here ships HTML and JS that runs as first-party
// code on this origin (same cookies, storage, caches). Only add repos whose owners
// are trusted; a malicious commit upstream is a malicious commit here. HUB_CSP below
// narrows what such a page can do, but cannot isolate it from the origin.
const HUB = "/hub/gnmath/";
// gn-math's own org is blocked on jsDelivr, so the up-to-date fork goes first.
const REPOS = ["freebuisness/html", "gn-math/html"];
const BRANCH = "main";

// Games whose gn-math page is broken, replaced by a self-contained copy: the page
// redirects to the copy's index.html, and the copy's folder is fetched only from its
// repo (asking the others first costs a slow esm.sh 404 per file).
const COPIES = {
    // gn-math's Moto X3M pulls from repos that are gone; this copy has all 50 levels.
    "96.html": { repo: "mochawoof/html55-new", dir: "embeds/moto_x3m/" },
    // gn-math's old Eaglercraft versions are "this version is broken" stubs; UGS has offline single-file builds.
    "298.html": { repo: "bubbls/ugs-singlefile", dir: "UGS-Files/", page: "clEaglercraft-Alpha-126-Offline.html" },
    "299.html": { repo: "bubbls/ugs-singlefile", dir: "UGS-Files/", page: "clEaglercraft-Beta-1.3-Offline.html" },
    "301.html": { repo: "bubbls/ugs-singlefile", dir: "UGS-Files/", page: "clEaglercraft-Indev-Offline.html" },
};

// Per-game rewrites of hub HTML pages: [text that identifies the game's page, rewrite].
const HTML_FIXES = [
    // Draw Climber's egret build draws nothing on some WebGL/ANGLE drivers (black canvas,
    // no errors). Its 2D canvas renderer paints correctly.
    ["yrgen73/draw-cl", (body) => body.replace(/renderMode:\s*"webgl"/g, 'renderMode: "canvas"')],
    // Minecraft 1.8.8's <base> is missing jsDelivr's "gh/", so every file 404s.
    ["cdn.jsdelivr.net/Theprocat27/", (body) => body.replace("cdn.jsdelivr.net/Theprocat27/", "cdn.jsdelivr.net/gh/Theprocat27/")],
];

// A few catalog entries point at renamed files ("7-f.html"); gn-math still has "<id>.html".
const RENAMED_RE = /^(\d+)\D[^/]*\.html$/;

// Any GitHub (/gh/) or npm (/npm/) file on a jsDelivr edge. esm.sh serves GitHub files
// under /gh/ with the same "repo@ref/path" layout and npm files at the root as
// "pkg@ver/path". "?raw" stops esm.sh from turning .js files into ES modules.
// Some school filters' proxy scripts choke on a raw ' in a URL, so it goes out as %27.
const JSDELIVR_RE = /^https:\/\/(?:cdn|gcore|fastly|testingcf)\.jsdelivr\.net\/(gh|npm)\/([^?#]+)(\?[^#]*)?/;
function viaEsm(href) {
    const m = JSDELIVR_RE.exec(href);
    if (!m) return href;
    // esm.sh has no "@latest" for GitHub repos; leaving the ref out means the default branch.
    const path = m[1] === "gh" ? "gh/" + m[2].replace(/^([^/]+\/[^/@]+)@latest\//, "$1/") : m[2];
    return ("https://esm.sh/" + path + (m[3] ? m[3] + "&raw" : "?raw")).replace(/'/g, "%27");
}

// bubbls/youtube-playables' ytgame.js is the real YouTube Playables SDK, which
// waits on a YouTube host that never exists here: getLanguage() pends forever,
// so game wrappers stall on a black screen before loading their scripts. Its
// tail also fetches location.orgin+"/pages/home.html" (typo for origin), which
// resolves to <game>/undefined/pages/home.html and 404s. The stub mirrors the
// real SDK's offline behavior (loadData resolves "", isAudioEnabled is sync,
// getLanguage falls back to "en"); unlisted members resolve to a no-op that
// returns a resolved promise so callers can invoke them unconditionally.
const YTGAME_RE = /^https:\/\/[^/]+\.jsdelivr\.net\/gh\/bubbls\/youtube-playables@[^/]+\/ytgame\.js(?:[?#]|$)/;
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

// Cross-origin files that games request and that need replacing: [URL pattern, handler].
const CROSS_ORIGIN_FIXES = [
    [BROKEN_C3_RE, (req) => fixedC3Runtime(req).catch(() => fetch(req))],
    [YTGAME_RE, () => new Response(YTGAME_STUB, {
        headers: { "Content-Type": "text/javascript", "Cache-Control": "public, max-age=86400" },
    })],
];

// Every hub file comes from esm.sh first (the one host that gets through filters that
// block jsDelivr), then from jsDelivr.
const SOURCES = [
    (r, b, p) => viaEsm(`https://cdn.jsdelivr.net/gh/${r}@${b}/${p}`),
    (r, b, p) => `https://cdn.jsdelivr.net/gh/${r}@${b}/${p}`,
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

const HUB_RE = /^\/hub\/gnmath(?:\/|$)(.*)$/;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

function hubPath(pathname) {
    const m = HUB_RE.exec(pathname);
    if (!m) return null;
    const path = m[1];
    return path === "" || path.endsWith("/") ? path + "index.html" : path;
}

// Root-relative requests ("/js/main.js") coming from a hub page belong to the hub.
async function fromHubPage(event) {
    if (event.request.referrer && HUB_RE.test(new URL(event.request.referrer).pathname)) return true;
    // Looking up resultingClientId during a navigation deadlocks; only subresources get here.
    if (event.request.mode !== "navigate" && event.clientId) {
        const client = await self.clients.get(event.clientId);
        return !!client && HUB_RE.test(new URL(client.url).pathname);
    }
    return false;
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
// Synchronous XHRs bypass the service worker, so hub pages reroute those in the page.
const ESM_SYNC_XHR = `<script>(()=>{const JSDELIVR_RE=${JSDELIVR_RE};const viaEsm=${viaEsm};const open=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u,a,...r){if(a===false)u=viaEsm(new URL(u,document.baseURI).href);return open.call(this,m,u,a,...r)}})()</script>`;

// Some engines (e.g. Bowmasters' PixiJS) ask for failIfMajorPerformanceCaveat, so on
// software-rendered GPUs (Microsoft Basic Render Driver) they get no WebGL and draw nothing.
const ALLOW_SLOW_WEBGL = `<script>(()=>{const g=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,o){if(o&&o.failIfMajorPerformanceCaveat)o={...o,failIfMajorPerformanceCaveat:false};return g.call(this,t,o)}})()</script>`;

// Sent with every hub HTML page. Hub games need inline scripts, eval and CDN assets,
// so script/connect sources stay open; this pins down the rest: pages can only be
// framed by this site, can only retarget relative URLs with <base> at the CDNs the
// games are served from anyway (gn-math pages do this for games hosted in other
// repos), cannot pull workers or service workers from other origins, and cannot mix
// in plain http.
const HUB_CSP = "frame-ancestors 'self'; base-uri 'self' https://*.jsdelivr.net https://esm.sh; worker-src 'self' blob:; upgrade-insecure-requests";

// Give up on a source that has not answered with headers after this long.
const SOURCE_TIMEOUT_MS = 8000;

function fetchWithTimeout(url, init) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), SOURCE_TIMEOUT_MS);
    return fetch(url, { ...init, referrerPolicy: "no-referrer", signal: ctl.signal }).finally(() => clearTimeout(timer));
}

// First ok response for path across repos and SOURCES; logs every attempt in tried.
async function firstOk(repos, path, tried) {
    for (const repo of repos) {
        for (const build of SOURCES) {
            const url = build(repo, BRANCH, path);
            const res = await fetchWithTimeout(url, { cache: "force-cache" }).catch((e) => e);
            tried.push([res.status || res.name, url]);
            if (res.ok) return res;
        }
    }
    return null;
}

async function fromMirrors(path) {
    if (COPIES[path]) return Response.redirect(HUB + COPIES[path].dir + (COPIES[path].page || "index.html"), 302);
    const copy = Object.values(COPIES).find((c) => path.startsWith(c.dir));
    const repos = copy ? [copy.repo] : REPOS;
    const tried = [];
    const missing = () => tried.some(([status]) => status === 404);
    let res = await firstOk(repos, path, tried);
    const renamed = RENAMED_RE.exec(path);
    if (!res && renamed && missing()) res = await firstOk(repos, renamed[1] + ".html", tried);
    if (!res) {
        // Listed so a user without devtools can paste which source answered what (AbortError = cut off or timed out).
        return new Response("Not found: " + path + "\n\n" + tried.map((t) => t.join(" ")).join("\n"),
            { status: missing() ? 404 : 502, headers: { "Content-Type": "text/plain" } });
    }
    const headers = new Headers();
    const mime = mimeFor(path) || res.headers.get("content-type") || "application/octet-stream";
    headers.set("Content-Type", mime);
    headers.set("Cache-Control", "public, max-age=86400");
    let body = res.body;
    if (mime === "text/html") {
        headers.set("Content-Security-Policy", HUB_CSP);
        headers.set("X-Content-Type-Options", "nosniff");
        // Hub pages must keep sending a full referrer, or their root-relative
        // links can't be routed back to the hub.
        body = (await res.text()).replace(/<meta\s+name=["']?referrer["']?[^>]*>/gi, "");
        for (const [marker, fix] of HTML_FIXES) if (body.includes(marker)) body = fix(body);
        const inject = STAY_FRAMED + ESM_SYNC_XHR + ALLOW_SLOW_WEBGL;
        body = /<head[^>]*>/i.test(body)
            ? body.replace(/<head[^>]*>/i, (tag) => tag + inject)
            : body.replace(/^(\s*<!doctype[^>]*>)?/i, (doctype) => doctype + inject);
    }
    return new Response(body, { status: 200, headers });
}

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== "GET") return;

    // Game scripts request jsDelivr files themselves; those go through esm.sh too.
    if (url.origin !== self.location.origin) {
        const fix = CROSS_ORIGIN_FIXES.find(([re]) => re.test(url.href));
        if (fix) {
            event.respondWith(fix[1](event.request));
            return;
        }
        if (!JSDELIVR_RE.test(url.href)) return;
        event.respondWith((async () => {
            const req = event.request;
            const init = req.mode === "navigate"
                ? {}
                : { mode: req.mode, credentials: req.credentials, headers: req.headers, redirect: req.redirect };
            try {
                const res = await fetch(viaEsm(url.href), init);
                if (res.ok || res.type === "opaque") return res;
            } catch (_) { /* fall back to the original */ }
            return fetch(req);
        })());
        return;
    }

    const direct = hubPath(url.pathname);
    if (direct) {
        event.respondWith(fromMirrors(direct));
        return;
    }

    if (url.pathname === "/sw.js") return;
    // The bounce out of a top-level hub page carries a hub referrer; it must reach the real 404 page.
    if (event.request.mode === "navigate" && url.search === UNFRAME_QUERY) return;

    event.respondWith((async () => {
        if (!(await fromHubPage(event))) return fetch(event.request);
        // A "../" from a hub's root page climbs out to "/hub/x"; on the real site the
        // browser would have clamped it at the root, so drop the stray "hub" segment.
        const path = url.pathname.replace(/^\/(hub\/)?/, "");
        if (event.request.mode === "navigate") {
            return Response.redirect(HUB + path + url.search + url.hash, 302);
        }
        return fromMirrors(path);
    })());
});
