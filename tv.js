const themeButton = document.getElementById('theme');
const paintTheme = () => {
    themeButton.textContent = document.documentElement.classList.contains('dark') ? 'Light' : 'Dark';
};
themeButton.addEventListener('click', () => {
    const dark = document.documentElement.classList.toggle('dark');
    try { localStorage.theme = dark ? 'dark' : 'light'; } catch { /* Theme still works without storage. */ }
    paintTheme();
});
paintTheme();
document.cookie = 'access_granted=tv.html; max-age=2592000; path=/';

const player = document.getElementById('tv-player');
const frame = document.getElementById('tv-frame');
const status = document.getElementById('tv-status');
const type = document.getElementById('tv-type');
type.addEventListener('change', () => {
    for (const name of ['season', 'episode']) {
        document.getElementById(name + '-field').hidden = type.value !== 'tv';
        document.getElementById(name).disabled = type.value !== 'tv';
    }
});
document.getElementById('tv-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const id = document.getElementById('tmdb-id').value;
    const season = document.getElementById('season').value;
    const episode = document.getElementById('episode').value;
    const path = type.value === 'tv' ? `tv/${id}/${season}/${episode}` : `movie/${id}`;
    const url = new URL(`https://0vidads.top/embed/${path}`);
    url.search = new URLSearchParams({branding: 'larp.surf', loading: '2', back: 'false'});
    frame.src = url.href;
    document.getElementById('tv-external').href = url.href;
    player.hidden = false;
    status.textContent = `Player requested for ${type.value === 'tv' ? `show ${id}, season ${season}, episode ${episode}` : `movie ${id}`}. Select Play in the player to begin.`;
});
document.getElementById('tv-stop').addEventListener('click', () => {
    frame.removeAttribute('src');
    player.hidden = true;
    status.textContent = 'Player closed. Choose a title to watch.';
    document.querySelector('#tv-form button').focus();
});
