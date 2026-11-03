// Browser-local recent games use the shared library card builder.
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
})();
