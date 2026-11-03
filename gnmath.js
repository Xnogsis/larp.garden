// Shared gn-math/UGS catalog and viewer. sw.js serves games under /hub/<hub>/.
// The script's data attributes select the hub and catalog/cover hosts.
const HUB = document.currentScript.dataset.hub || "gnmath";
const TITLE = document.currentScript.dataset.title || "gn-math";
const hubUrl = (file) => "/hub/" + HUB + "/" + file;
const gamePath = (zone) => zone.url.replace("{HTML_URL}/", "").split("/").map(encodeURIComponent).join("/");
const gameUrl = (zone) => zone.localUrl || hubUrl(gamePath(zone));
const SOURCES = document.currentScript.dataset.sources.trim().split(/\s+/);
// esm.sh rewrites .js files into ES modules unless asked for the raw file.
const at = (src, repo, path) => src + repo + "@" + GAME_SOURCE_PINS["Xnogsis/" + repo] + "/" + path + (src.includes("esm.sh") ? "?raw" : "");

const grid = document.getElementById("grid");
const status = document.getElementById("status");
const search = document.getElementById("search");
const count = document.getElementById("count");
const note = GameDiagnostics.note;
const player = new GameViewer({hub: HUB, title: TITLE, gameUrl, note, onOpen: zone => {
    GameLibrary.remember(HUB, zone);
    const [id, label] = ESM_NOTES[zone.id] || [];
    esmNote.hidden = !id; esmNote.dataset.id = id; esmButton.textContent = label || "";
}});
const openZone = zone => player.open(zone);
GameDiagnostics.onError(() => {
    if (player.active) player.fail("The game reported an error. If it stays blank, retry or use More for other launch options.");
});
let zones = [];

// Wait this long for a source to answer with headers before moving on to the next.
const SOURCE_TIMEOUT_MS = 8000;

function fetchWithTimeout(url, init) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), SOURCE_TIMEOUT_MS);
    return fetch(url, { ...init, signal: ctl.signal }).finally(() => clearTimeout(timer));
}

async function firstOk(repo, path) {
    // Same-origin copy first: refreshed daily by .github/workflows/catalog.yml and no extra connection.
    const local = await fetchWithTimeout(path, { cache: "no-cache" }).catch(() => null);
    if (local && local.ok) return local;
    for (const src of SOURCES) {
        try {
            const res = await fetchWithTimeout(at(src, repo, path), { cache: "no-cache", referrerPolicy: "no-referrer" });
            if (res.ok) return res;
        } catch (_) { /* next source */ }
    }
    throw new Error("all sources failed for " + repo + "/" + path);
}

// t/ holds ~9 KB thumbnails of the covers (avg ~400 KB), made by .github/scripts/catalog.py.
function coverFor(zone) {
    if (zone.localUrl) return [zone.cover];
    const file = (zone.cover || "").replace("{COVER_URL}/", "");
    return ["t/" + file.replace(/\.[^.]+$/, ".webp"), ...SOURCES.map((s) => at(s, "covers", file))];
}

// Warm the game page while the pointer is on its card; sw.js fetches with force-cache,
// so the click reuses the response.
const warmed = new Set();
function warm(zone) {
    if (zone.localUrl || warmed.has(zone.id) || zone.url.startsWith("http")) return;
    warmed.add(zone.id);
    fetch(hubUrl(gamePath(zone))).catch(() => {});
}

function render(filter) {
    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const q = normalize(filter);
    const shown = zones.filter((z) => !q || normalize(z.name).includes(q));
    const rows = document.createDocumentFragment();
    for (const z of shown) {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.className = "zone";
        btn.dataset.gameId = String(z.id);
        btn.type = "button";
        const img = document.createElement("img");
        img.loading = "lazy";
        img.decoding = "async";
        img.alt = "";
        const covers = coverFor(z);
        let i = 0;
        if (z.cover) img.src = covers[i];
        img.onerror = () => { if (++i < covers.length) img.src = covers[i]; else img.onerror = null; };
        const name = document.createElement("span");
        name.textContent = z.name;
        if (z.cover) btn.append(img);
        else btn.classList.add("text-zone");
        btn.append(name);
        btn.addEventListener("click", () => openZone(z));
        btn.addEventListener("pointerenter", () => warm(z));
        li.append(btn);
        rows.append(li);
    }
    grid.replaceChildren(rows);
    count.textContent = shown.length + " of " + zones.length;
    document.getElementById("empty-state").hidden = shown.length > 0;
    const other = document.getElementById("other-catalog");
    other.href = (HUB === "ugs" ? "gnmath.html" : "ugs.html") + "?q=" + encodeURIComponent(filter);
    other.textContent = HUB === "ugs" ? "Search the main Games collection" : "Search UGS single-file games";
}

// Retro Bowl College's files come from a repo esm.sh refuses to serve, so on networks
// that block jsDelivr it stays black; plain Retro Bowl loads.
const ESM_NOTES = HUB === "gnmath" ? { 34: [33, "play Retro Bowl"] } : {};
const esmNote = document.createElement("span");
esmNote.hidden = true;
esmNote.textContent = "Black screen? Your network may block jsDelivr. ";
const esmButton = document.createElement("button");
esmButton.type = "button";
esmButton.addEventListener("click", () => { const z = zones.find((z) => z.id === +esmNote.dataset.id); if (z) openZone(z); });
esmNote.append(esmButton);
document.getElementById("advanced-actions").prepend(esmNote);

document.getElementById("clear-search").addEventListener("click", () => {
    search.value = ""; render(""); search.focus();
});
document.getElementById("catalog-retry").addEventListener("click", () => location.reload());

const themeBtn = document.getElementById("theme");
const paintTheme = () => { themeBtn.textContent = document.documentElement.classList.contains("dark") ? "Light" : "Dark"; };
themeBtn.addEventListener("click", () => {
    localStorage.theme = document.documentElement.classList.toggle("dark") ? "dark" : "light";
    paintTheme();
});
paintTheme();

let searchTimer;
search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => render(search.value), 150);
});

const swReady = "serviceWorker" in navigator
    ? Promise.race([
        navigator.serviceWorker.register("sw.js", {scope: "/", updateViaCache: "none"}).then(async reg => {
            // Returning visitors must wait for the new loader to claim this page.
            if (navigator.serviceWorker.controller) await reg.update();
            const next = reg.installing || reg.waiting || (reg.active !== navigator.serviceWorker.controller ? reg.active : null);
            if (next) await new Promise((resolve, reject) => {
                const cleanup = () => {
                    navigator.serviceWorker.removeEventListener("controllerchange", changed);
                    next.removeEventListener("statechange", changed);
                };
                const changed = () => {
                    if (next.state === "redundant") { cleanup(); reject(new Error("The game loader update failed. Reload or reset the loader on Home.")); }
                    else if (navigator.serviceWorker.controller === next && next.state === "activated") { cleanup(); resolve(); }
                };
                navigator.serviceWorker.addEventListener("controllerchange", changed);
                next.addEventListener("statechange", changed);
                changed();
            });
            await navigator.serviceWorker.ready;
            if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener("controllerchange", resolve, {once: true}));
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("The game loader did not start. Reload this page or reset the game loader on Home.")), 15000))
    ])
    : Promise.reject(new Error("This browser cannot start the game loader. Use HTTPS and a browser with service worker support."));

const catalog = HUB === "ugs" ? fetchWithTimeout("ugs-games.json") : firstOk("assets", "zones.json");
Promise.all([catalog.then((r) => { if (!r.ok) throw new Error("catalog HTTP " + r.status); return r.json(); }), swReady])
    .then(([list]) => {
        zones = GameLibrary.catalog(HUB, list);
        player.setCatalog(zones);
        document.cookie = "access_granted=" + HUB + ".html; max-age=2592000; path=/";
        status.textContent = "";
        const params = new URLSearchParams(location.search);
        search.value = params.get("q") || "";
        render(search.value);
        player.restore();
    })
    .catch((e) => { status.textContent = "Could not load " + TITLE + ": " + e.message; document.getElementById("catalog-retry").hidden = false; });
