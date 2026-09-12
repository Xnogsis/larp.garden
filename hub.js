(() => {
    const slug = document.currentScript.dataset.hub;
    const name = document.currentScript.dataset.name || slug;
    document.title = name;

    const frame = document.createElement("iframe");
    frame.allow = "fullscreen; autoplay; gamepad";
    frame.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0";
    // A hub link the service worker couldn't attribute (no referrer) lands on this
    // site's own root; send it back into the hub.
    frame.addEventListener("load", () => {
        let loc;
        try { loc = frame.contentWindow.location; } catch (_) { return; }
        if (loc.origin === location.origin && !loc.pathname.startsWith("/hub/")) {
            loc.replace("/hub/" + slug + loc.pathname + loc.search + loc.hash);
        }
    });

    const fail = (why) => {
        document.body.style.cssText = "font:17px 'Times New Roman',serif;padding:24px";
        document.body.textContent = "Could not load " + name + ". " + why;
    };

    if (!("serviceWorker" in navigator)) {
        fail("This browser does not allow service workers, which the loader needs.");
        return;
    }

    navigator.serviceWorker.register("sw.js", { scope: "/" })
        .then(() => navigator.serviceWorker.ready)
        .then(() => {
            if (!navigator.serviceWorker.controller) {
                return new Promise((resolve) => {
                    navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
                    setTimeout(resolve, 1500);
                });
            }
        })
        .then(() => {
            frame.src = "/hub/" + slug + "/";
            document.body.append(frame);
        })
        .catch((e) => fail(String(e)));
})();
