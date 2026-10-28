const statusText = document.getElementById('status');
let dataUrl;
let configUrl;
async function startSlope() {
    try {
        const parts = await Promise.all([1, 2].map(async (part) => {
            const response = await fetch(`Build/WEB1.2.1.data.unityweb.part${part}`);
            if (!response.ok) throw new Error(`Game data part ${part}: HTTP ${response.status}`);
            return response.arrayBuffer();
        }));
        dataUrl = URL.createObjectURL(new Blob(parts));
        const config = {
            companyName: 'Slope Plus', productName: 'Slope Plus',
            dataUrl,
            wasmCodeUrl: new URL('Build/WEB1.2.1.wasm.code.unityweb', location.href).href,
            wasmFrameworkUrl: new URL('Build/WEB1.2.1.wasm.framework.unityweb', location.href).href,
            TOTAL_MEMORY: 268435456,
            graphicsAPI: ['WebGL 2.0', 'WebGL 1.0'],
            webglContextAttributes: {preserveDrawingBuffer: false},
            splashScreenStyle: 'Dark', backgroundColor: '#000000'
        };
        configUrl = URL.createObjectURL(new Blob([JSON.stringify(config)], {type: 'application/json'}));
        window.gameInstance = UnityLoader.instantiate('gameContainer', configUrl, {
            onProgress: (_, progress) => {
                statusText.textContent = `Loading Slope: ${Math.round(progress * 100)}%`;
                statusText.hidden = progress === 1;
            },
            Module: {onAbort: (reason) => {
                statusText.hidden = false;
                statusText.textContent = `Could not start Slope: ${reason}. Reload to retry.`;
            }}
        });
    } catch (error) {
        statusText.textContent = `Could not load Slope: ${error.message}. Reload to retry.`;
    }
}
startSlope();
window.addEventListener('pagehide', () => {
    if (dataUrl) URL.revokeObjectURL(dataUrl);
    if (configUrl) URL.revokeObjectURL(configUrl);
});
