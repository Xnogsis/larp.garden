// Catalog page for a gn-math style hub. The <script> tag says which sw.js hub serves
// the games and which hosts (each a "<cdn>/<owner>/" prefix) the catalog and covers come from.
const HUB = document.currentScript.dataset.hub;
const TITLE = document.currentScript.dataset.title || HUB;
const SOURCES = document.currentScript.dataset.sources.trim().split(/\s+/);
const at = (src, repo, path) => src.includes("jsdelivr") ? src + repo + "@main/" + path : src + repo + "/main/" + path;

const grid = document.getElementById("grid");
const status = document.getElementById("status");
const search = document.getElementById("search");
const count = document.getElementById("count");
const viewer = document.getElementById("viewer");
const frame = document.getElementById("frame");
let zones = [];

async function firstOk(repo, path) {
    for (const src of SOURCES) {
        try {
            const res = await fetch(at(src, repo, path), { cache: "no-cache" });
            if (res.ok) return res;
        } catch (_) { /* next source */ }
    }
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

async function open(zone) {
    if (zone.url.startsWith("http")) { window.open(zone.url, "_blank", "noopener"); return; }
    document.getElementById("viewer-title").textContent = zone.name;
    document.getElementById("viewer-author").textContent = zone.author ? "by " + zone.author : "";
    // A few catalog entries point at renamed files; the plain "<id>.html" usually still exists.
    let file = zone.url.replace("{HTML_URL}/", "");
    const probe = await fetch("/hub/" + HUB + "/" + file).catch(() => null);
    if (!probe || !probe.ok) file = zone.id + ".html";
    frame.src = "/hub/" + HUB + "/" + file;
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
search.addEventListener("input", () => render(search.value));

const swReady = "serviceWorker" in navigator
    ? navigator.serviceWorker.register("sw.js", { scope: "/" }).then(() => navigator.serviceWorker.ready)
    : Promise.reject(new Error("no service worker support"));

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
