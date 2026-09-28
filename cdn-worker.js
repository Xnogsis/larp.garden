// Cloudflare Worker behind cdn.larp.garden: the same jsDelivr paths (/gh/..., /npm/...)
// served from this site's own domain, for networks that block jsDelivr and GitHub
// but allow the site (sw.js tries this host first). Files jsDelivr refuses, such as
// those over its 20 MB limit, come from raw.githubusercontent.com instead.
//
// Deploy: Cloudflare dashboard > Workers & Pages > Create > paste this file, then
// Settings > Domains & Routes > Custom domain "cdn.larp.garden" (the larp.garden zone
// must be on Cloudflare DNS for that).
export default {
    async fetch(request) {
        const url = new URL(request.url);
        const m = /^\/(gh|npm)\/(.+)/.exec(url.pathname);
        if (!m) return new Response("Not found", { status: 404 });
        const init = { headers: { Accept: request.headers.get("Accept") || "*/*" }, cf: { cacheEverything: true } };
        let res = await fetch("https://cdn.jsdelivr.net" + url.pathname + url.search, init);
        if (!res.ok && m[1] === "gh") {
            const gh = /^([^/]+\/[^/@]+)@([^/]+)\/(.*)$/.exec(m[2]);
            if (gh) res = await fetch(`https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/${gh[3]}`, init);
        }
        res = new Response(res.body, res);
        res.headers.set("Access-Control-Allow-Origin", "*");
        return res;
    },
};
