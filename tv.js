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
const sourceSelect = document.getElementById('tv-source');
const form = document.getElementById('tv-form');
const idInput = document.getElementById('tmdb-id');
let idType = 'TMDB';
for (const source of TV_SOURCES) {
    sourceSelect.add(new Option(source.name + (source.unavailable ? ' (website only)' : ''), source.key));
}
const selectedSource = () => TV_SOURCES.find((source) => source.key === sourceSelect.value);
const closePlayer = () => {
    frame.removeAttribute('src');
    player.hidden = true;
    document.getElementById('tv-external').removeAttribute('href');
};
const updateFields = () => {
    const source = selectedSource();
    for (const option of type.options) {
        option.disabled = !source[option.value];
        option.hidden = option.disabled;
    }
    type.disabled = !!source.unavailable;
    if (!source[type.value]) type.value = ['movie', 'tv', 'anime'].find((kind) => source[kind]) || 'movie';
    for (const name of ['season', 'episode']) {
        const visible = !source.unavailable && (type.value === 'tv' || (name === 'episode' && type.value === 'anime'));
        document.getElementById(name + '-field').hidden = !visible;
        document.getElementById(name).disabled = !visible;
    }
    const nextIdType = type.value === 'anime' ? source.idType : 'TMDB';
    if (idType !== nextIdType) idInput.value = '';
    idType = nextIdType;
    document.getElementById('tv-id-label').textContent = `${idType} ID`;
    idInput.placeholder = idType === 'TMDB' ? 'e.g. 1339713' : idType === 'MyAnimeList' ? 'e.g. 59708' : 'e.g. 16498';
    idInput.disabled = !!source.unavailable;
    form.querySelector('button').disabled = !!source.unavailable;
    document.getElementById('tv-source-note').textContent = source.unavailable || `${source.name} uses ${idType} IDs.`;
    document.getElementById('tv-source-site').href = source.website;
    closePlayer();
    status.textContent = source.unavailable || `Enter a ${idType} ID to load ${source.name}.`;
};
type.addEventListener('change', updateFields);
sourceSelect.addEventListener('change', updateFields);
updateFields();
form.addEventListener('submit', (event) => {
    event.preventDefault();
    const source = selectedSource();
    if (!form.reportValidity() || !source[type.value]) return;
    const id = idInput.value;
    const season = document.getElementById('season').value;
    const episode = document.getElementById('episode').value;
    const values = {id, season, episode};
    const path = source[type.value].replace(/\{(id|season|episode)\}/g, (_, key) => encodeURIComponent(values[key]));
    const url = new URL(path, source.base || source.website);
    frame.src = url.href;
    document.getElementById('tv-external').href = url.href;
    player.hidden = false;
    frame.title = `${source.name} player`;
    document.getElementById('tv-host').textContent = source.name;
    status.textContent = `${source.name}: player requested for ${type.value === 'tv' ? `show ${id}, season ${season}, episode ${episode}` : `${type.value} ${id}${type.value === 'anime' ? `, episode ${episode}` : ''}`}. Select Play in the player to begin.`;
});
document.getElementById('tv-stop').addEventListener('click', () => {
    closePlayer();
    status.textContent = 'Player closed. Choose a title to watch.';
    document.querySelector('#tv-form button').focus();
});
