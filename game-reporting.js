// Manual issue reports and bounded, deduplicated automatic error reports.
window.GameReporter = class GameReporter {
    constructor({hub, diagnostics, config = window.GAME_REPORTING}) {
        Object.assign(this, {hub, diagnostics, config});
        this.active = null;
        this.errors = [];
        this.latest = '';
        this.history = [];
        this.session = null;
        this.autoEnabled = this.preference();
        const actions = document.getElementById('advanced-actions');
        this.button = document.createElement('button');
        this.button.type = 'button'; this.button.id = 'report-game'; this.button.textContent = 'Report a game problem';
        this.button.disabled = !config?.enabled;
        this.button.addEventListener('click', () => this.open());
        const label = document.createElement('label'); label.className = 'report-auto-label';
        this.toggle = document.createElement('input'); this.toggle.type = 'checkbox'; this.toggle.id = 'auto-reports';
        this.toggle.checked = this.autoEnabled; this.toggle.disabled = !config?.enabled;
        label.append(this.toggle, ' Send automatic game error reports');
        this.toggle.addEventListener('change', () => {
            this.autoEnabled = this.toggle.checked;
            try { localStorage.setItem('game-reports-auto', this.autoEnabled ? 'on' : 'off'); } catch (_) { /* Browser-local preference. */ }
            if (!this.autoEnabled) { clearTimeout(this.timer); this.timer = null; this.pending = null; }
        });
        window.addEventListener('storage', event => {
            if (event.key === 'game-reports-auto') { this.autoEnabled = this.preference(); this.toggle.checked = this.autoEnabled; }
        });
        const notice = document.createElement('p');
        notice.textContent = config?.enabled
            ? 'Reports send game errors and browser information to the site owner’s Discord. Cookies and saved games are not included.'
            : 'Reporting is available on larp.mom.';
        actions.append(this.button, label, notice);
        this.createDialog();
        diagnostics.onEvent(event => this.event(event));
    }
    preference() { try { return localStorage.getItem('game-reports-auto') !== 'off'; } catch (_) { return true; } }
    clean(value, limit = 1500) {
        return String(value || '').replace(/https?:\/\/[^\s<>"`]+/gi, raw => {
            try {
                const url = new URL(raw);
                if (/discord(?:app)?\.com$/.test(url.hostname) && url.pathname.includes('/webhooks/')) return '[webhook redacted]';
                return url.origin + url.pathname;
            } catch (_) { return '[URL redacted]'; }
        }).replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
            .replace(/\b(authorization|password|cookie|access_token|api_key|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
            .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, limit);
    }
    setGame(zone) {
        this.clearGame();
        this.active = {hub:this.hub, id:String(zone.id), name:zone.name};
    }
    clearGame() {
        clearTimeout(this.timer); this.timer = null; this.pending = null; this.active = null; this.errors = []; this.latest = '';
        if (this.dialog?.open) this.dialog.close();
    }
    event({kind, message}) {
        if (!this.active || !['error', 'rejection', 'viewer error'].includes(kind)) return;
        const text = this.clean(message);
        this.errors.push(kind + ': ' + text); this.errors = this.errors.slice(-8);
        const priority = kind === 'viewer error' ? 1 : 2;
        if (priority === 2 || !this.latest) this.latest = text;
        if (!this.config?.enabled || !this.autoEnabled) return;
        if (!this.pending || priority >= this.pending.priority) this.pending = {message:text, priority};
        if (this.timer) return;
        this.timer = setTimeout(() => {
            this.timer = null;
            const pending = this.pending; this.pending = null;
            if (!pending || !this.active || !this.autoEnabled) return;
            const key = JSON.stringify([this.active.hub, this.active.id, pending.message]);
            if (!this.reserve(key)) return;
            const payload = this.payload('auto'); payload.error = pending.message;
            this.send(payload).catch(() => this.diagnostics.note('report', 'Automatic report could not be sent. Manual reporting remains available.'));
        }, 1200);
    }
    reserve(key) {
        let history;
        try { history = JSON.parse(localStorage.getItem('game-reports-history') || '[]'); } catch (_) { history = this.history; }
        if (!Array.isArray(history)) history = [];
        history = history.filter(item => item && typeof item.key === 'string' && Number.isFinite(item.time) && item.time > Date.now() - 15 * 60 * 1000).slice(-10);
        if (history.length >= 3 || history.some(item => item.key === key)) return false;
        history.push({key, time:Date.now()}); this.history = history;
        try { localStorage.setItem('game-reports-history', JSON.stringify(history)); } catch (_) { /* In-memory dedupe still works. */ }
        return true;
    }
    payload(mode) {
        const environment = this.diagnostics.snapshot();
        return {
            mode, game:{...this.active}, description:mode === 'manual' ? this.clean(this.description.value, 1200) : '',
            error:mode === 'auto' || this.include.checked ? this.clean(this.latest, 1500) : '',
            environment:{browser:environment.browser.slice(0,450), webgl:this.clean(environment.webgl,200), serviceWorker:environment.serviceWorker},
            events:mode === 'manual' && this.include.checked ? this.errors.slice(-6).map(value => this.clean(value,100)) : [],
        };
    }
    createDialog() {
        this.dialog = document.createElement('dialog'); this.dialog.id = 'report-dialog';
        this.dialog.setAttribute('aria-labelledby', 'report-title');
        // Fixed markup only; game names, diagnostics and messages are always assigned through textContent.
        this.dialog.innerHTML = `<form id="report-form">
            <h2 id="report-title">Report a game problem</h2>
            <p id="report-game-name"></p>
            <label for="report-description">What went wrong?</label>
            <textarea id="report-description" rows="4" minlength="5" maxlength="1200" required placeholder="What happened, and how can we reproduce it?"></textarea>
            <label class="report-auto-label"><input id="report-include" type="checkbox" checked> Include recent error details</label>
            <p class="muted">Sends this report and basic browser information to the site owner’s Discord. No cookies, screenshots, or saved games are collected.</p>
            <details><summary>Preview report</summary><pre id="report-preview"></pre></details>
            <p id="report-result" role="status" aria-live="polite"></p>
            <div class="report-buttons"><button id="send-report" type="submit">Send report</button><button id="cancel-report" type="button">Close</button></div>
        </form>`;
        document.getElementById('viewer').append(this.dialog);
        this.description = this.dialog.querySelector('#report-description');
        this.include = this.dialog.querySelector('#report-include');
        this.result = this.dialog.querySelector('#report-result');
        this.submit = this.dialog.querySelector('#send-report');
        const preview = () => { if (this.active) this.dialog.querySelector('#report-preview').textContent = JSON.stringify(this.payload('manual'), null, 2); };
        this.description.addEventListener('input', preview); this.include.addEventListener('change', preview);
        this.dialog.querySelector('#cancel-report').addEventListener('click', () => this.dialog.close());
        this.dialog.addEventListener('close', () => { if (this.active) document.getElementById('viewer-options').querySelector('summary').focus(); });
        this.dialog.querySelector('form').addEventListener('submit', async event => {
            event.preventDefault();
            if (!this.active || this.submit.disabled) return;
            const payload = this.payload('manual');
            this.submit.disabled = true; this.result.textContent = 'Sending report…';
            try {
                const response = await this.send(payload);
                this.result.textContent = response.duplicate ? 'This report has already been received.' : 'Report sent. Thank you.';
            } catch (error) { this.result.textContent = error.message; }
            finally { this.submit.disabled = false; }
        });
    }
    open() {
        if (!this.active || !this.config?.enabled) return;
        document.getElementById('viewer-options').open = false;
        this.description.value = ''; this.include.checked = true; this.result.textContent = '';
        this.dialog.querySelector('#report-game-name').textContent = this.active.name;
        this.dialog.querySelector('#report-preview').textContent = JSON.stringify(this.payload('manual'), null, 2);
        this.dialog.showModal(); this.description.focus();
    }
    async request(path, options = {}) {
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
        try { return await fetch(this.config.endpoint + path, {...options, credentials:'omit', signal:controller.signal}); }
        finally { clearTimeout(timer); }
    }
    async send(payload, refresh = false) {
        if (!this.config?.enabled) throw new Error('Reporting is available on larp.mom.');
        try {
            if (!this.session || this.session.expiresAt < Date.now() + 30000) {
                const session = await this.request('/v1/session');
                if (!session.ok) throw new Error('session');
                this.session = await session.json();
            }
            const response = await this.request('/v1/report', {method:'POST', headers:{'Content-Type':'application/json','X-Report-Token':this.session.token}, body:JSON.stringify(payload)});
            if (response.status === 401 && !refresh) { this.session = null; return this.send(payload, true); }
            if (response.status === 429) throw new Error('Too many reports right now. Please try again in a few minutes.');
            if (!response.ok) throw new Error('delivery');
            return await response.json();
        } catch (error) {
            if (error.message?.startsWith('Too many reports')) throw error;
            throw new Error('Could not send the report. Please try again later.');
        }
    }
};
