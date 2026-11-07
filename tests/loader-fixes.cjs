// Regression cases for the upstream startup patterns in games 14, 6, 207 and 792.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const worker = {Response, Headers, self:{location:{origin:'https://larp.surf'}, addEventListener(){}}, importScripts(){}};
vm.runInNewContext(fs.readFileSync('sw.js', 'utf8') + '\nglobalThis.rewrite = body => {for(const [marker,fix] of HTML_FIXES) if(body.includes(marker)) body=fix(body);return body;};', worker);

test('Bridge Race delivers save data after Unity resolves its instance', async () => {
    const body = `// bridge-race-save
var unityGameInstance = null;
Promise.resolve('saved-data').then(data => unityGameInstance.SendMessage('YTGameWrapper','ReceiveOnLoadSaveEvent',data));
var done = new Promise(resolve => setTimeout(() => {
    const unityInstance = {SendMessage: (...args) => delivered.push(args)};
    unityGameInstance = unityInstance;
    resolve();
}, 0));`;
    const context = {setTimeout, delivered:[]};
    vm.createContext(context);
    vm.runInContext(worker.rewrite(body), context);
    await context.done;
    assert.deepEqual(context.delivered.map(args => Array.from(args)), [['YTGameWrapper','ReceiveOnLoadSaveEvent','saved-data']]);
    assert.equal(context.pendingUnityMessages.length, 0);
});

test('Block Blast keeps startup without trying a cross-origin service worker', () => {
    const body = `window.addEventListener("load", function () {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(
        "https://cdn.jsdelivr.net/gh/bubblfan/bl/ServiceWorker.js",
      );
    }
  });
  globalThis.unityStartup = true;`;
    const context = {window:{addEventListener:(_, callback)=>callback()}, navigator:{serviceWorker:{register(){throw new Error('Invalid worker origin');}}}};
    vm.runInNewContext(worker.rewrite(body), context);
    assert.equal(context.unityStartup, true);
});

test('Snowbattle removes host wrappers and retains engine/support scripts', () => {
    const body = `<base href="https://cdn.jsdelivr.net/gh/wnasmile/LAMAR@main/snowbattle/">
<script type="application/javascript" src="/js/main.js"></script>
<script src="Build/UnityLoader.js"></script>
<script src="shared/lib.js" type="text/javascript"></script>
<script type="application/javascript" src="/js/lib.js"></script>`;
    const fixed = worker.rewrite(body);
    assert.ok(!fixed.includes('src="/js/'));
    assert.ok(fixed.includes('src="Build/UnityLoader.js"'));
    assert.ok(fixed.includes('src="shared/lib.js"'));
    const unrelated = '<script src="/js/lib.js"></script>';
    assert.equal(worker.rewrite(unrelated), unrelated);
});


test('Escape Road 3 exposes its actual async loader config to the framework', async () => {
    const body = `// bubblfan/escape-road-3@
globalThis.done = (async () => {
    await Promise.resolve();
    var config = {dataUrl:'blob:merged-data', codeUrl:'blob:merged-wasm'};
    config.gameId = 'escape-road-3';
    config.eventLog = false;
    return config;
})();`;
    const context = {};
    context.window = context;
    vm.createContext(context);
    vm.runInContext(worker.rewrite(body), context);
    const loaderConfig = await context.done;
    // This is the framework's first global access, which previously threw.
    vm.runInContext('config.sourceHtml = "framework metadata"; globalThis.frameworkConfig = config;', context);
    assert.equal(context.frameworkConfig, loaderConfig);
    assert.equal(context.frameworkConfig.dataUrl, 'blob:merged-data');
    assert.equal(context.frameworkConfig.codeUrl, 'blob:merged-wasm');
    assert.equal(context.frameworkConfig.gameId, 'escape-road-3');
    assert.equal(context.frameworkConfig.eventLog, false);
});


test('Biotomata routes its HTML, module, stylesheet, fonts and images to the pinned repository root', async () => {
    const original = worker.firstOk;
    const calls = [];
    worker.firstOk = async (repos, path) => {
        calls.push({repos:Array.from(repos), path});
        return new Response(path.endsWith('.html') ? '<!doctype html><head></head><body></body>' : 'fixture');
    };
    try {
        for (const [path, type] of [
            ['index.html','text/html'], ['assets/index-CH2_gaqm.js','text/javascript'],
            ['assets/style-BPL8IerJ.css','text/css'], ['assets/Aldrich-Regular-BJ2Af9cL.ttf','font/ttf'],
            ['img/organs/unicellular/eyes.jpg','image/jpeg'],
        ]) {
            const response = await worker.fromMirrors('biotomata/' + path);
            assert.equal(response.status, 200);
            assert.equal(response.headers.get('Content-Type'), type);
            assert.deepEqual(calls.at(-1), {repos:['Xnogsis/Biotomata-Game'], path});
            if (path.endsWith('.html')) assert.ok((await response.text()).includes('parent.lgDebug'));
        }
    } finally { worker.firstOk = original; }
});
