(() => {
    const notice = document.createElement('div');
    notice.className = 'home-notice';
    notice.innerHTML = `<div class="home-notice-window"><span>r.i.p librewolf and xvpn</span></div>
        <button type="button" class="home-notice-toggle" aria-label="Pause scrolling notice" aria-pressed="false">Pause</button>`;
    document.getElementById('theme').before(notice);

    const toggle = notice.querySelector('button');
    const text = notice.querySelector('span');
    const key = 'header-notice';
    const animation = () => text.getAnimations()[0];
    const setPaused = (paused) => {
        notice.classList.toggle('paused', paused);
        toggle.setAttribute('aria-pressed', String(paused));
        toggle.setAttribute('aria-label', paused ? 'Resume scrolling notice' : 'Pause scrolling notice');
        toggle.textContent = paused ? 'Resume' : 'Pause';
    };
    const restore = () => {
        try {
            const saved = JSON.parse(sessionStorage.getItem(key));
            if (!saved) return;
            setPaused(saved.paused === true);
            const current = animation();
            if (current && Number.isFinite(saved.time) && Number.isFinite(saved.at)) {
                current.currentTime = saved.time + (saved.paused ? 0 : Math.max(0, Date.now() - saved.at));
            }
        } catch { /* Keep scrolling normally when session storage is unavailable. */ }
    };
    const save = () => {
        try {
            sessionStorage.setItem(key, JSON.stringify({
                time: animation()?.currentTime ?? 0,
                at: Date.now(),
                paused: notice.classList.contains('paused')
            }));
        } catch { /* The notice still works without saved state. */ }
    };
    restore();
    toggle.addEventListener('click', () => {
        setPaused(!notice.classList.contains('paused'));
        save();
    });
    window.addEventListener('pagehide', save);
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) restore();
    });
})();
