// Catalog page for a gn-math style hub. The <script> tag says which sw.js hub serves
// the games and which hosts (each a "<cdn>/<owner>/" prefix) the catalog and covers come from.
const HUB = document.currentScript.dataset.hub;
const TITLE = document.currentScript.dataset.title || HUB;
const SOURCES = document.currentScript.dataset.sources.trim().split(/\s+/);
// esm.sh rewrites .js files into ES modules unless asked for the raw file.
const at = (src, repo, path) => src + repo + "@main/" + path + (src.includes("esm.sh") ? "?raw" : "");

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
    const rows = document.createDocumentFragment();
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
        btn.addEventListener("click", () => openZone(z));
        li.append(btn);
        rows.append(li);
    }
    grid.replaceChildren(rows);
    count.textContent = shown.length + " of " + zones.length;
}

// Retro Bowl College's files come from a repo esm.sh refuses to serve, so on networks
// that block jsDelivr it stays black; plain Retro Bowl loads.
const ESM_NOTES = { 34: [33, "play Retro Bowl"] };
const esmNote = document.createElement("span");
esmNote.hidden = true;
esmNote.textContent = "Black screen? Your network may block jsDelivr. ";
const esmButton = document.createElement("button");
esmButton.type = "button";
esmButton.addEventListener("click", () => { const z = zones.find((z) => z.id === +esmNote.dataset.id); if (z) openZone(z); });
esmNote.append(esmButton);
document.getElementById("viewer-author").after(esmNote);

function openZone(zone) {
    if (zone.url.startsWith("http")) { window.open(zone.url, "_blank", "noopener"); return; }
    document.getElementById("viewer-title").textContent = zone.name;
    document.getElementById("viewer-author").textContent = zone.author ? "by " + zone.author : "";
    const [esmId, esmLabel] = ESM_NOTES[zone.id] || [];
    esmNote.hidden = !esmId;
    esmNote.dataset.id = esmId;
    esmButton.textContent = esmLabel;
    // A few catalog entries point at renamed files; only a 4xx confirms one is missing.
    // Network failures and timeouts leave the catalog file's own error visible.
    // Iframes fire load, not error, on a 404 page, so the iframe starts on the catalog's file
    // right away while a probe of the same URL checks whether the file is missing.
    const url = "/hub/" + HUB + "/" + zone.url.replace("{HTML_URL}/", "");
    note("open", zone.id + " " + url);
    frame.src = url;
    fetch(url).then((r) => r.status >= 400 && r.status < 500, () => false).then((missing) => {
        if (missing && frame.src === new URL(url, location.href).href) frame.src = "/hub/" + HUB + "/" + zone.id + ".html";
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
// Hub pages bounce out when not framed, so the new tab gets this viewer, which reopens ?id=.
document.getElementById("newtab").addEventListener("click", () => window.open(location.href, "_blank"));
document.getElementById("hidebar").addEventListener("click", () => viewer.classList.add("nobar"));
document.getElementById("showbar").addEventListener("click", () => viewer.classList.remove("nobar"));
// The new tab has our origin, so sw.js still serves the iframe; only the address bar shows about:blank.
document.getElementById("blank").addEventListener("click", () => {
    const w = window.open("about:blank");
    if (!w) return;
    const d = w.document;
    d.title = document.title;
    const style = d.createElement("style");
    style.textContent = "body{margin:0}iframe{border:0;width:100vw;height:100vh}";
    const iframe = d.createElement("iframe");
    iframe.title = frame.title;
    iframe.allow = "fullscreen; autoplay; gamepad";
    iframe.src = frame.src;
    d.head.append(style);
    d.body.append(iframe);
});
// Debug panel for when a game stays black and devtools are out of reach. Hub pages call
// parent.lgDebug(window) as they start (sw.js injects the call), so their errors and failed
// loads are collected here; the "debug" button shows them along with what the browser supports.
const debugLog = [];
const debugPanel = document.createElement("div");
const debugText = document.createElement("pre");
let gpu;
function note(kind, msg) {
    if (debugLog.length >= 300) debugLog.shift();
    debugLog.push((performance.now() / 1000).toFixed(1).padStart(6) + "s " + kind + " " + String(msg).slice(0, 400));
    if (debugPanel.isConnected) showDebug();
}
function describe(x) {
    return x instanceof Error ? x.stack || x.message : typeof x === "object" ? (() => { try { return JSON.stringify(x); } catch (_) { return String(x); } })() : String(x);
}
window.lgDebug = (win) => {
    note("page", win.location.href);
    win.performance.setResourceTimingBufferSize(5000);
    win.addEventListener("error", (e) => {
        const el = e.target;
        if (el && el !== win && (el.src || el.href)) note("load failed", el.localName + " " + (el.src || el.href));
        else note("error", e.message + (e.filename ? " @ " + e.filename + ":" + e.lineno : ""));
    }, true);
    win.addEventListener("unhandledrejection", (e) => note("rejection", describe(e.reason)));
    for (const level of ["error", "warn"]) {
        const orig = win.console[level];
        win.console[level] = (...args) => { note("console." + level, args.map(describe).join(" ")); return orig.apply(win.console, args); };
    }
    const fetch0 = win.fetch;
    win.fetch = (...args) => fetch0.apply(win, args).then(
        (r) => { if (!r.ok && r.type !== "opaque") note("fetch " + r.status, r.url); return r; },
        (e) => { note("fetch failed", (args[0] && args[0].url) || args[0]); throw e; });
    const open0 = win.XMLHttpRequest.prototype.open;
    win.XMLHttpRequest.prototype.open = function (method, url) {
        this.addEventListener("loadend", () => { if (!this.status || this.status >= 400) note("xhr " + (this.status || "failed"), url); });
        return open0.apply(this, arguments);
    };
};
// Where a slow loading bar spends its time: per host, how many files and how long each took.
function loadTiming() {
    let list;
    try { list = frame.contentWindow.performance.getEntriesByType("resource"); } catch (_) { return []; }
    if (!list.length) return [];
    const hosts = {};
    for (const e of list) (hosts[new URL(e.name).host] ||= []).push(e);
    return ["loads: " + list.length + " files"].concat(
        Object.entries(hosts).sort((a, b) => b[1].length - a[1].length).map(([host, es]) => {
            const ms = es.map((e) => Math.round(e.duration)).sort((a, b) => a - b);
            const done = Math.max(...es.map((e) => e.responseEnd)) / 1000;
            return "  " + host + ": " + ms.length + " files, median " + ms[ms.length >> 1] + "ms, slowest " +
                ms[ms.length - 1] + "ms, all done " + done.toFixed(1) + "s after the game opened";
        }));
}
function showDebug() {
    if (!gpu) {
        const c = document.createElement("canvas");
        const gl = c.getContext("webgl2") || c.getContext("webgl");
        const info = gl && gl.getExtension("WEBGL_debug_renderer_info");
        gpu = !gl ? "unavailable" : (gl instanceof WebGLRenderingContext ? "webgl1 " : "webgl2 ")
            + gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    }
    let canvases = "n/a";
    try { canvases = [...frame.contentDocument.querySelectorAll("canvas")].map((c) => c.width + "x" + c.height).join(", ") || "none"; } catch (_) { /* cross-origin page */ }
    debugText.textContent = [
        "browser: " + navigator.userAgent,
        "webgl: " + gpu,
        "service worker: " + (navigator.serviceWorker && navigator.serviceWorker.controller ? "active" : "NOT controlling this page"),
        "game: " + frame.src,
        "game canvases: " + canvases,
        ...loadTiming(),
        "",
    ].concat(debugLog.length ? debugLog : ["(nothing logged yet)"]).join("\n");
}
debugPanel.id = "debug";
const debugBar = document.createElement("div");
const copyBtn = document.createElement("button");
copyBtn.type = "button";
copyBtn.textContent = "copy";
copyBtn.addEventListener("click", () => navigator.clipboard.writeText(debugText.textContent).then(
    () => { copyBtn.textContent = "copied"; }, () => getSelection().selectAllChildren(debugText)));
const hideBtn = document.createElement("button");
hideBtn.type = "button";
hideBtn.textContent = "close";
hideBtn.addEventListener("click", () => debugPanel.remove());
debugBar.append("debug log ", copyBtn, " ", hideBtn);
debugPanel.append(debugBar, debugText);
const debugBtn = document.createElement("button");
debugBtn.type = "button";
debugBtn.textContent = "debug";
debugBtn.addEventListener("click", () => {
    if (debugPanel.isConnected) return debugPanel.remove();
    copyBtn.textContent = "copy";
    viewer.append(debugPanel);
    showDebug();
});
document.getElementById("fullscreen").before(debugBtn);

const themeBtn = document.getElementById("theme");
const paintTheme = () => { themeBtn.textContent = document.documentElement.classList.contains("dark") ? "Light" : "Dark"; };
themeBtn.addEventListener("click", () => {
    if (document.documentElement.classList.toggle("dark")) localStorage.theme = "dark"; else localStorage.removeItem("theme");
    paintTheme();
});
paintTheme();

let searchTimer;
search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => render(search.value), 150);
});

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
        if (z) openZone(z);
    })
    .catch((e) => { status.textContent = "Could not load " + TITLE + ": " + e.message; });
