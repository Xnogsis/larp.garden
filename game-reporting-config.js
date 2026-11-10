// Public relay address only. The Discord webhook is stored in the relay's runtime secrets.
window.GAME_REPORTING = Object.freeze({
    endpoint: 'https://larp-game-reports-v7m4k2.cableddough.chatgpt.site',
    enabled: location.hostname === 'larp.mom',
});
