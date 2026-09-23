// Catalog page for a gn-math style hub. The <script> tag says which sw.js hub serves
// the games and which hosts (each a "<cdn>/<owner>/" prefix) the catalog and covers come from.
const HUB = document.currentScript.dataset.hub;
const TITLE = document.currentScript.dataset.title || HUB;
const SOURCES = document.currentScript.dataset.sources.trim().split(/\s+/);
// jsDelivr and esm.sh use "repo@ref/path", raw.githubusercontent uses "repo/ref/path".
// esm.sh rewrites .js files into ES modules unless asked for the raw file.
const at = (src, repo, path) => src.includes("raw.githubusercontent") ? src + repo + "/main/" + path
    : src + repo + "@main/" + path + (src.includes("esm.sh") ? "?raw" : "");

const grid = document.getElementById("grid");
const status = document.getElementById("status");
const search = document.getElementById("search");
const count = document.getElementById("count");
const viewer = document.getElementById("viewer");
const frame = document.getElementById("frame");
let zones = [];

// Wait this long for a source to answer with headers before moving on to the next.
const SOURCE_TIMEOUT_MS = 8000;

function fetchWithTimeout(url, init) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), SOURCE_TIMEOUT_MS);
    return fetch(url, { ...init, signal: ctl.signal }).finally(() => clearTimeout(timer));
}

async function firstOk(repo, path) {
    for (const src of SOURCES) {
        try {
            const res = await fetchWithTimeout(at(src, repo, path), { cache: "no-cache", referrerPolicy: "no-referrer" });
            if (res.ok) return res;
        } catch (_) { /* next source */ }
    }
    // Same-origin copy committed to this repo, for networks that drop cross-site CDN requests.
    const local = await fetchWithTimeout(path).catch(() => null);
    if (local && local.ok) return local;
    throw new Error("all sources failed for " + repo + "/" + path);
}

function coverFor(zone) {
    const file = (zone.cover || "").replace("{COVER_URL}/", "");
    return SOURCES.map((s) => at(s, "covers", file));
}

function render(filter) {
    const q = filter.trim().toLowerCase();
    const shown = zones.filter((z) => !q || z.name.toLowerCase().includes(q));
    grid.textContent = "";
    for (const z of shown) {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.className = "zone";
        btn.type = "button";
        const img = document.createElement("img");
        img.loading = "lazy";
        img.alt = "";
        const covers = coverFor(z);
        let i = 0;
        img.src = covers[i];
        img.onerror = () => { if (++i < covers.length) img.src = covers[i]; else img.onerror = null; };
        const name = document.createElement("span");
        name.textContent = z.name;
        btn.append(img, name);
        btn.addEventListener("click", () => open(z));
        li.append(btn);
        grid.append(li);
    }
    count.textContent = shown.length + " of " + zones.length;
}

function open(zone) {
    if (zone.url.startsWith("http")) { window.open(zone.url, "_blank", "noopener"); return; }
    document.getElementById("viewer-title").textContent = zone.name;
    document.getElementById("viewer-author").textContent = zone.author ? "by " + zone.author : "";
    // A few catalog entries point at renamed files; the plain "<id>.html" usually still exists.
    // Iframes fire load, not error, on a 404 page, so the iframe starts on the catalog's file
    // right away while a probe of the same URL decides whether to swap in the fallback.
    const url = "/hub/" + HUB + "/" + zone.url.replace("{HTML_URL}/", "");
    frame.src = url;
    fetch(url).then((r) => r.ok, () => false).then((ok) => {
        if (!ok && frame.src === new URL(url, location.href).href) frame.src = "/hub/" + HUB + "/" + zone.id + ".html";
    });
    frame.title = zone.name;
    viewer.classList.add("open");
    document.title = zone.name;
    history.replaceState(null, "", "?id=" + zone.id);
}

document.getElementById("close").addEventListener("click", () => {
    viewer.classList.remove("open");
    frame.src = "about:blank";
    document.title = TITLE;
    history.replaceState(null, "", location.pathname);
});
document.getElementById("fullscreen").addEventListener("click", () => frame.requestFullscreen && frame.requestFullscreen());
document.getElementById("newtab").addEventListener("click", () => window.open(frame.src, "_blank"));
document.getElementById("hidebar").addEventListener("click", () => viewer.classList.add("nobar"));
document.getElementById("showbar").addEventListener("click", () => viewer.classList.remove("nobar"));
// The new tab has our origin, so sw.js still serves the iframe; only the address bar shows about:blank.
document.getElementById("blank").addEventListener("click", () => {
    const w = window.open("about:blank");
    if (!w) return;
    w.document.write('<title>' + document.title + '</title><style>body{margin:0}iframe{border:0;width:100vw;height:100vh}</style>');
    w.document.close();
    const f = w.document.createElement("iframe");
    f.src = frame.src;
    f.title = frame.title;
    f.allow = "fullscreen; autoplay; gamepad";
    w.document.body.append(f);
});
search.addEventListener("input", () => render(search.value));

const swReady = "serviceWorker" in navigator
    ? navigator.serviceWorker.register("sw.js", { scope: "/" }).then((reg) => {
        // sw.js skipWaiting()s and claims clients, so an update still installing when the
        // page loads becomes the controller shortly; hold off until it does or an old
        // worker would answer /hub/ paths it doesn't know about.
        const next = reg.installing || reg.waiting;
        if (!next) return navigator.serviceWorker.ready;
        return new Promise((r) => {
            navigator.serviceWorker.addEventListener("controllerchange", r, { once: true });
            // A failed update never fires controllerchange; carry on with whatever worker is active.
            next.addEventListener("statechange", () => { if (next.state === "redundant") r(navigator.serviceWorker.ready); });
        });
    })
    : Promise.reject(new Error(location.protocol === "http:"
        ? "service workers need https; open https://" + location.host + " instead"
        : "no service worker support"));

Promise.all([firstOk("assets", "zones.json").then((r) => r.json()), swReady])
    .then(([list]) => {
        zones = list.filter((z) => z.id >= 0 && z.url && !z.url.startsWith("http"));
        status.textContent = "";
        render("");
        const id = new URLSearchParams(location.search).get("id");
        const z = id && zones.find((x) => String(x.id) === id);
        if (z) open(z);
    })
    .catch((e) => { status.textContent = "Could not load " + TITLE + ": " + e.message; });
