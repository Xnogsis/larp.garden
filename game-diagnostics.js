window.GameDiagnostics = (() => {
const viewer = document.getElementById("viewer");
// Debug panel for when a game stays black and devtools are out of reach. Hub pages call
// parent.lgDebug(window) as they start (sw.js injects the call), so their errors and failed
// loads are collected here; the "debug" button shows them along with what the browser supports.
const debugLog = [];
const debugPanel = document.createElement("div");
const debugText = document.createElement("pre");
let gpu;
const gameFrame = () => document.getElementById("frame");
const errorListeners = new Set();
function note(kind, msg) {
    if (debugLog.length >= 300) debugLog.shift();
    debugLog.push((performance.now() / 1000).toFixed(1).padStart(6) + "s " + kind + " " + String(msg).slice(0, 400));
    if (debugPanel.isConnected) showDebug();
    if (kind === "error" || kind === "rejection") errorListeners.forEach(callback => callback(kind, msg));
}
function describe(x) {
    return x instanceof Error ? x.stack || x.message : typeof x === "object" ? (() => { try { return JSON.stringify(x); } catch (_) { return String(x); } })() : String(x);
}
window.lgDebug = (win) => {
    const log = (kind, message) => { if (win === gameFrame().contentWindow) note(kind, message); };
    log("page", win.location.href);
    win.performance.setResourceTimingBufferSize(5000);
    win.addEventListener("error", (e) => {
        const el = e.target;
        if (el && el !== win && (el.src || el.href)) {
            const url = new URL(el.src || el.href, win.location.href);
            log("load failed", el.localName + " " + url.href);
            if (el.localName === "script") log("error", "Game script failed to load: " + url.href);
            if (url.origin === location.origin && /^https?:$/.test(url.protocol)) {
                win.fetch(url.href, { method: "HEAD", cache: "no-store" }).then(
                    (r) => log("asset HEAD", r.status + " " + r.headers.get("content-type") + " " + url.href),
                    (e) => log("asset HEAD failed", e.message + " " + url.href)
                );
            }
        }
        else log("error", e.message + (e.filename ? " @ " + e.filename + ":" + e.lineno : ""));
    }, true);
    win.addEventListener("unhandledrejection", (e) => log("rejection", describe(e.reason)));
    for (const level of ["error", "warn"]) {
        const orig = win.console[level];
        win.console[level] = (...args) => { log("console." + level, args.map(describe).join(" ")); return orig.apply(win.console, args); };
    }
    const fetch0 = win.fetch;
    win.fetch = (...args) => fetch0.apply(win, args).then(
        (r) => { if (!r.ok && r.type !== "opaque") log("fetch " + r.status, r.url); return r; },
        (e) => { log("fetch failed", (args[0] && args[0].url) || args[0]); throw e; });
    const open0 = win.XMLHttpRequest.prototype.open;
    win.XMLHttpRequest.prototype.open = function (method, url) {
        this.addEventListener("loadend", () => { if (!this.status || this.status >= 400) log("xhr " + (this.status || "failed"), url); });
        return open0.apply(this, arguments);
    };
};
// Where a slow loading bar spends its time: per host, how many files and how long each took.
function loadTiming() {
    let list;
    try { list = gameFrame().contentWindow.performance.getEntriesByType("resource"); } catch (_) { return []; }
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
    try { canvases = [...gameFrame().contentDocument.querySelectorAll("canvas")].map((c) => c.width + "x" + c.height).join(", ") || "none"; } catch (_) { /* cross-origin page */ }
    debugText.textContent = [
        "browser: " + navigator.userAgent,
        "webgl: " + gpu,
        "service worker: " + (navigator.serviceWorker && navigator.serviceWorker.controller ? "active" : "NOT controlling this page"),
        "game: " + gameFrame().src,
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
debugBtn.textContent = "Show diagnostics";
debugBtn.addEventListener("click", () => {
    if (debugPanel.isConnected) return debugPanel.remove();
    copyBtn.textContent = "copy";
    viewer.append(debugPanel);
    showDebug();
});
document.getElementById("advanced-actions").append(debugBtn);


return {note, onError: callback => errorListeners.add(callback)};
})();
