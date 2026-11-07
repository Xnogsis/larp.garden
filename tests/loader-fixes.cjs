// Regression cases for the upstream startup patterns in games 14, 6, 207 and 792.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const listeners = {};
const worker = {Response, Headers, URL, AbortController, setTimeout, clearTimeout, self:{location:{origin:'https://larp.surf'}, addEventListener(name,callback){listeners[name]=callback;}}, importScripts(){}};
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


test('Prestige Tree uses the classic Vue build', () => {
    const body = '<script src="js/technical/layerSupport.js"></script><script src="https://cdn.jsdelivr.net/npm/vue@2.6.12"></script>';
    assert.ok(worker.rewrite(body).includes('src="https://cdn.jsdelivr.net/npm/vue@2.6.12/dist/vue.min.js"'));
});


test('CDN failures fall back to raw GitHub with readable status and executable JavaScript MIME', async () => {
    const calls=[];
    worker.fetch=async (url, options) => {
        calls.push({url,options});
        return new Response(calls.length<3 ? 'unavailable' : 'window.loaderReady=true;', {
            status:calls.length===1 ? 502 : calls.length===2 ? 403 : 200,
            headers:{'Content-Type':'text/plain','X-Content-Type-Options':'nosniff'},
        });
    };
    let pending;
    listeners.fetch({request:new Request('https://cdn.jsdelivr.net/gh/bubbls/UGS-Assets@main/scrap-metal/scrapUnityLoader.js',{mode:'no-cors'}),respondWith(value){pending=value;}});
    const response=await pending;
    assert.equal(response.status,200);
    assert.equal(response.headers.get('Content-Type'),'text/javascript');
    assert.equal(calls[2].url,'https://raw.githubusercontent.com/bubbls/UGS-Assets/main/scrap-metal/scrapUnityLoader.js');
    assert.ok(calls.every(call=>call.options.mode==='cors' && call.options.credentials==='omit'));
    assert.equal(await response.text(),'window.loaderReady=true;');
});

test('blocked Githack bases use the supported CDN and Monster Tracks gets its missing overlay node', () => {
    for (const path of ['assets/main/madalin-stunt-cars-2/','brainrot/main/make-a-superboat/']) {
        const fixed=worker.rewrite('<base href="https://rawcdn.githack.com/genizy/'+path+'">');
        assert.ok(fixed.includes('https://cdn.jsdelivr.net/gh/genizy/'+path.replace('/main/','@main/')));
    }
    assert.ok(worker.rewrite('monster-tracks/webapp/source_min.js<div id="canvas_border">').includes('id="gradient"'));
});

test('Brotato queries its own service-worker registration while preserving explicit URL checks', async () => {
    const seen=[];
    const context={location:{href:'https://larp.surf/hub/gnmath/723-fix.html'},navigator:{serviceWorker:{getRegistration(url){seen.push(url);return Promise.resolve();}}}};
    vm.runInNewContext(worker.rewrite('// Stinkalistic/UGS@main/MISC/brotato/\nconst GODOT_CONFIG = {};'),context);
    await context.navigator.serviceWorker.getRegistration();
    await context.navigator.serviceWorker.getRegistration('https://example.test/explicit');
    assert.deepEqual(seen,[context.location.href,'https://example.test/explicit']);
});

test('OvO defers canvas-dependent code and loads the bundled translation pack', () => {
    const fixed=worker.rewrite('Replku/Ovo@<script src="unlockalllevels.js"></script>');
    assert.ok(fixed.includes('defer src="unlockalllevels.js"'));
    assert.ok(fixed.includes("fetch('languages.json')"));
});

test('Paper.io uses its asset root and preserves the asynchronous no-ad SDK lifecycle', async () => {
    const root='https://cdn.jsdelivr.net/gh/234sd4w5w45wers5tr-645758574456456/435345345346@main/';
    assert.equal(worker.rewrite(`<script src="${root}js/window.js"></script>`), `<base href="${root}">`);
    worker.fetch=async () => new Response("const path='sdk.js';const promo={'JqIoy':_p2_0x465c('0xae')};");
    let pending;
    const dispatch=url=>{listeners.fetch({request:new Request(url),respondWith(value){pending=Promise.resolve(value);}});return pending;};
    const app=await (await dispatch(root+'js/app-new-gm.js')).text();
    assert.ok(app.includes(JSON.stringify(root+'js/sdk.js')));
    assert.ok(app.includes('data:application/json,%7B%22banners%22:%5B%5D,%22interval%22:0%7D'));
    const timers=[], events=[], context={window:{},setTimeout(callback){timers.push(callback);}};
    vm.runInNewContext(await (await dispatch(root+'js/sdk.js')).text(),context);
    context.window.SDK_OPTIONS={onEvent:event=>events.push(event.name)};
    assert.deepEqual(events,[]);
    timers.shift()();
    context.window.sdk.showBanner();
    assert.deepEqual(events,['SDK_READY','SDK_GAME_PAUSE']);
    timers.shift()();
    assert.deepEqual(events,['SDK_READY','SDK_GAME_PAUSE','SDK_GAME_START']);
});

test('CDN error details are enabled without changing inline JavaScript strings', async () => {
    const inline=`const example='<script src="demo.js"><\\/script>';`;
    const html=`<head><base href="https://cdn.jsdelivr.net/gh/example/game@main/"></head><script src="engine.js"></script><script>${inline}</script>`;
    const original=worker.firstOk;
    worker.firstOk=async()=>new Response(html);
    try {
        const result=await (await worker.fromMirrors('test.html')).text();
        assert.ok(result.includes('<script crossorigin="anonymous" src="engine.js">'));
        assert.ok(result.includes(`<script>${inline}</script>`));
    } finally {worker.firstOk=original;}
});
