// Viewer navigation, history, focus and loading recovery. No catalog fetching here.
window.GameViewer = class GameViewer {
    constructor({hub, title, gameUrl, note, onOpen}) {
        Object.assign(this, {hub, title, gameUrl, note, onOpen});
        this.viewer = document.getElementById('viewer');
        this.options = document.getElementById('viewer-options');
        this.feedback = document.getElementById('game-feedback');
        this.message = document.getElementById('game-status');
        this.background = [...document.querySelectorAll('body > header, body > main')];
        this.catalog = [];
        this.active = null;
        this.timers = [];
        document.getElementById('close').addEventListener('click', () => this.close());
        document.getElementById('fullscreen').addEventListener('click', () => {
            const frame = document.getElementById('frame');
            frame.requestFullscreen?.().catch(() => this.status('Fullscreen is unavailable. You can open the viewer in a new tab.'));
        });
        document.getElementById('newtab').addEventListener('click', () => window.open(location.href, '_blank', 'noopener'));
        document.getElementById('copy-link').addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(location.href); this.status('Game link copied.'); }
            catch (_) { this.status('Copy the game link from your browser address bar.'); }
        });
        document.getElementById('blank').addEventListener('click', () => this.blank());
        document.getElementById('hidebar').addEventListener('click', () => {
            this.options.open = false; this.viewer.classList.add('nobar'); document.getElementById('showbar').focus();
        });
        document.getElementById('showbar').addEventListener('click', () => {
            this.viewer.classList.remove('nobar'); document.getElementById('close').focus();
        });
        document.getElementById('retry-game').addEventListener('click', () => this.load(true));
        document.getElementById('advanced-retry').addEventListener('click', () => { this.options.open = false; this.load(true); });
        document.getElementById('alternate-source').addEventListener('click', () => {
            this.source = this.source === 'jsdelivr' ? '' : 'jsdelivr'; this.load(true);
        });
        document.getElementById('dismiss-status').addEventListener('click', () => { this.feedback.hidden = true; });
        document.getElementById('gametab')?.addEventListener('click', () => window.open(this.gameUrl(this.active), '_blank', 'noopener'));
        document.getElementById('jsdtab')?.addEventListener('click', () => {
            if (!this.active || this.active.localUrl) return;
            const path = this.active.url.replace('{HTML_URL}/', '').split('/').map(encodeURIComponent).join('/');
            const repo = this.hub === 'ugs' ? 'Xnogsis/ugs-singlefile' : 'Xnogsis/html';
            window.open('https://cdn.jsdelivr.net/gh/Xnogsis/larp.garden@main/play.svg#gh/' + repo + '@' + GAME_SOURCE_PINS[repo] + '/' + path, '_blank', 'noopener');
        });
        window.addEventListener('popstate', () => this.applyLocation());
        document.addEventListener('keydown', event => this.keydown(event));
        document.addEventListener('focusin', event => {
            if (this.active && !this.viewer.contains(event.target)) document.getElementById('close').focus();
        });
    }
    setCatalog(catalog) { this.catalog = catalog; }
    restore() {
        const id = new URLSearchParams(location.search).get('id');
        const zone = this.catalog.find(z => String(z.id) === id);
        const base = new URL(location.href); base.searchParams.delete('id');
        // A direct game URL gets a catalog entry beneath it, so Back closes the viewer.
        history.replaceState({catalog: this.hub}, '', base.pathname + base.search);
        if (zone) this.open(zone);
        else if (id) this.statusUnknown();
    }
    statusUnknown() {
        document.getElementById('status').textContent = 'That game is no longer in this catalog. Search for another game below.';
    }
    applyLocation() {
        const id = new URLSearchParams(location.search).get('id');
        const zone = this.catalog.find(z => String(z.id) === id);
        if (zone) this.open(zone, false);
        else this.hide();
    }
    open(zone, push = true) {
        if (!this.active) this.returnFocus = document.activeElement;
        this.active = zone; this.source = '';
        if (push) {
            const url = new URL(location.href); url.searchParams.set('id', zone.id);
            history.pushState({catalog: this.hub, viewer: true}, '', url.pathname + url.search);
        }
        document.getElementById('viewer-title').textContent = zone.name;
        document.getElementById('viewer-author').textContent = zone.author ? 'by ' + zone.author : '';
        const jsd = document.getElementById('jsdtab');
        if (jsd) jsd.hidden = !!zone.localUrl;
        document.getElementById('alternate-source').hidden = !!zone.localUrl;
        this.viewer.classList.add('open'); this.viewer.classList.remove('nobar');
        this.options.open = false;
        this.background.forEach(el => { el.inert = true; });
        document.body.classList.add('playing');
        document.title = zone.name;
        this.onOpen(zone);
        this.load();
        document.getElementById('close').focus();
    }
    close() {
        if (!this.active) return;
        this.hide();
        if (history.state?.viewer) history.back();
        else {
            const url = new URL(location.href); url.searchParams.delete('id');
            history.replaceState({catalog: this.hub}, '', url.pathname + url.search);
        }
    }
    clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }
    hide() {
        this.clearTimers(); this.active = null;
        this.viewer.classList.remove('open', 'nobar'); this.options.open = false;
        this.background.forEach(el => { el.inert = false; });
        document.body.classList.remove('playing'); document.title = this.title;
        const old = document.getElementById('frame');
        const blank = old.cloneNode(false); blank.src = 'about:blank'; old.replaceWith(blank);
        if (this.returnFocus?.isConnected && this.returnFocus !== document.body) this.returnFocus.focus();
        else document.getElementById('search').focus();
    }
    status(message) { this.message.textContent = message; this.feedback.hidden = false; }
    load(retry = false) {
        if (!this.active) return;
        this.clearTimers();
        const url = new URL(this.gameUrl(this.active), location.href);
        if (!this.active.localUrl) {
            if (this.source) url.searchParams.set('source', this.source);
        }
        if (retry) url.searchParams.set('retry', Date.now());
        this.status('Loading ' + this.active.name + '… Large games may take a while.');
        this.note('open', this.active.id + ' ' + url.pathname + url.search);
        // Replacing the element gives each game a fresh document without adding iframe history entries.
        const old = document.getElementById('frame');
        const frame = old.cloneNode(false);
        frame.title = this.active.name;
        frame.src = this.active.localUrl && !retry ? this.active.localUrl : url.pathname + url.search;
        frame.addEventListener('error', () => this.fail('The game page could not load. Try again or choose another source.'));
        frame.addEventListener('load', () => {
            if (!this.active || !frame.isConnected) return;
            try {
                const doc = frame.contentDocument;
                if (doc?.contentType === 'text/plain' || doc?.title === '404 Not Found') {
                    this.fail('The game source returned an error. Try again or choose another source.'); return;
                }
                frame.contentWindow.addEventListener('keydown', event => {
                    if (event.key === 'Escape') { event.preventDefault(); this.close(); }
                    if (event.key === 'Tab' && !event.defaultPrevented) {
                        const stops = [...doc.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
                            .filter(el => el.tabIndex >= 0 && !el.disabled && el.getClientRects().length);
                        const boundary = event.shiftKey ? stops[0] : stops[stops.length - 1];
                        if (!boundary || doc.activeElement === boundary) {
                            event.preventDefault();
                            if (event.shiftKey) this.options.querySelector('summary').focus();
                            else document.getElementById('close').focus();
                        }
                    }
                });
                frame.contentWindow.addEventListener('error', event => {
                    if (event.target === frame.contentWindow) this.fail('The game reported an error. If it stays blank, try again or use More for other launch options.');
                });
            } catch (_) { /* Cross-origin games manage their own content. */ }
            if (this.failed) return;
            this.clearTimers();
            this.status('Game page loaded. Its assets may still be downloading.');
            this.timers.push(setTimeout(() => { this.feedback.hidden = true; }, 5000));
        });
        this.failed = false;
        old.replaceWith(frame);
        this.timers.push(setTimeout(() => this.status('Still loading. Large games can be slow. You can retry or try another source; More has additional launch options.'), 30000));
    }
    fail(message) { this.failed = true; this.clearTimers(); this.status(message); }
    keydown(event) {
        if (!this.active) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            if (this.options.open) { this.options.open = false; this.options.querySelector('summary').focus(); }
            else this.close();
        }
        if (event.key === 'Tab') {
            const controls = [...this.viewer.querySelectorAll('button, summary, a[href], iframe')].filter(el => !el.disabled && !el.hidden && el.getClientRects().length);
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    }
    blank() {
        if (!this.active) return;
        const w = window.open('about:blank');
        if (!w) { this.status('The browser blocked the new window. Allow popups or use the current viewer.'); return; }
        w.opener = null;
        const d = w.document; d.title = this.active.name;
        const style = d.createElement('style'); style.textContent = 'body{margin:0}iframe{border:0;width:100vw;height:100vh}';
        const iframe = d.createElement('iframe'); iframe.title = this.active.name;
        iframe.allow = 'fullscreen; autoplay; gamepad'; iframe.src = new URL(this.gameUrl(this.active), location.href).href;
        d.head.append(style); d.body.append(iframe);
    }
};
