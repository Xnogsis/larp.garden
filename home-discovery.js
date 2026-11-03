// Home discovery uses the same catalog records and safe card builder as the library.
(() => {
    const recentList = document.getElementById('recent-games');
    function recent() {
        const games = GameLibrary.recent();
        recentList.replaceChildren(...games.map(GameLibrary.card));
        document.getElementById('recent-empty').hidden = games.length > 0;
        document.getElementById('clear-recent').hidden = !games.length;
    }
    recent();
    document.getElementById('clear-recent').addEventListener('click', () => {
        try { localStorage.removeItem('recent-games'); } catch (_) { /* Storage unavailable. */ }
        recent();
    });
    const featured = document.getElementById('featured-games');
    const locals = GameLibrary.localGames.map(z => ({...z, hub: 'gnmath'}));
    featured.replaceChildren(...locals.map(GameLibrary.card));
    fetch('zones.json').then(r => { if (!r.ok) throw new Error('catalog unavailable'); return r.json(); }).then(list => {
        const picks = [33, 96, 198].map(id => list.find(z => z.id === id)).filter(Boolean).map(z => ({
            ...z, hub: 'gnmath', cover: 't/' + z.cover.replace('{COVER_URL}/', '').replace(/\.[^.]+$/, '.webp')
        }));
        featured.replaceChildren(...[...picks, ...locals].map(GameLibrary.card));
    }).catch(() => { /* Locally hosted picks remain available. */ });
})();
