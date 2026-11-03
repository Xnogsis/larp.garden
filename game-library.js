// Catalog data and browser-local play history, shared by Home and both catalogs.
window.GameLibrary = (() => {
const LOCAL_GAMES = [
    { id: "antimatter", catalogOrder: 877.1, name: "Antimatter Dimensions", author: "IvarK", localUrl: "antimatter.html", cover: "icons/antimatter.webp" },
    { id: "isaac", catalogOrder: 877.2, name: "The Binding of Isaac: Repentance+", author: "chiikabu", localUrl: "isaac.html", cover: "icons/isaac-face.webp" },
    { id: "balatro", catalogOrder: 877.3, name: "Balatro", author: "LocalThunk", localUrl: "balatro/index.html", cover: "icons/balatro.webp" },
];

    function catalog(hub, list) {
        const games = list.filter(z => (hub === "ugs" || z.id >= 0) && z.url && !z.url.startsWith("http"));
        if (hub === "gnmath") games.push(...LOCAL_GAMES);
        return hub === "gnmath" ? games.sort((a, b) => (a.catalogOrder ?? a.id) - (b.catalogOrder ?? b.id)) : games;
    }
    function recent() {
        try {
            const saved = JSON.parse(localStorage.getItem("recent-games") || "[]");
            return Array.isArray(saved) ? saved.filter(g => g && ["gnmath", "ugs"].includes(g.hub)
                && ["string", "number"].includes(typeof g.id) && String(g.id).length < 200
                && typeof g.name === "string" && g.name.length < 200).slice(0, 8) : [];
        } catch (_) { return []; }
    }
    function remember(hub, zone) {
        const cover = zone.localUrl ? zone.cover : zone.cover ? "t/" + zone.cover.replace("{COVER_URL}/", "").replace(/\.[^.]+$/, ".webp") : "";
        const entry = {hub, id: zone.id, name: zone.name, cover};
        try { localStorage.setItem("recent-games", JSON.stringify([entry, ...recent().filter(g => g.hub !== hub || String(g.id) !== String(zone.id))].slice(0, 8))); } catch (_) { /* Storage may be unavailable. */ }
    }
    function card(game) {
        const li = document.createElement("li");
        const link = document.createElement("a");
        link.className = "zone discovery-card";
        link.href = game.hub + ".html?id=" + encodeURIComponent(game.id);
        if (/^(?:t|icons)\/[\w.-]+\.webp$/.test(game.cover || "")) {
            const img = document.createElement("img");
            img.src = game.cover; img.alt = ""; img.loading = "lazy";
            link.append(img);
        } else link.classList.add("text-zone");
        const label = document.createElement("span");
        label.textContent = game.name; link.append(label); li.append(link);
        return li;
    }
    return {catalog, recent, remember, card, localGames: LOCAL_GAMES};
})();
