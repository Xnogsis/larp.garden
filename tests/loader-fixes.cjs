// Regression cases for the upstream startup patterns in games 14, 6, 207 and 792.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const listeners = {};
const worker = {Response, Headers, URL, AbortController, setTimeout, clearTimeout, self:{location:{origin:'https://larp.mom'}, addEventListener(name,callback){listeners[name]=callback;}}, importScripts(){}};
vm.runInNewContext(fs.readFileSync('sw.js', 'utf8') + '\nglobalThis.rewrite = body => {for(const [marker,fix] of HTML_FIXES) if(body.includes(marker)) body=fix(body);return body;};', worker);

test('reporting recognizes the new production domain', () => {
    for (const [hostname, enabled] of [['larp.mom',true],['larp.surf',false],['localhost',false]]) {
        const context={window:{},location:{hostname}};
        vm.runInNewContext(fs.readFileSync('game-reporting-config.js','utf8'),context);
        assert.equal(context.window.GAME_REPORTING.enabled,enabled);
    }
});

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
    const context={location:{href:'https://larp.mom/hub/gnmath/723-fix.html'},navigator:{serviceWorker:{getRegistration(url){seen.push(url);return Promise.resolve();}}}};
    vm.runInNewContext(worker.rewrite('// Stinkalistic/UGS@main/MISC/brotato/\nconst GODOT_CONFIG = {};'),context);
    await context.navigator.serviceWorker.getRegistration();
    await context.navigator.serviceWorker.getRegistration('https://example.test/explicit');
    assert.deepEqual(seen,[context.location.href,'https://example.test/explicit']);
});

test('OvO defers canvas-dependent code', () => {
    const fixed=worker.rewrite('Replku/Ovo@<script src="unlockalllevels.js"></script>');
    assert.ok(fixed.includes('defer src="unlockalllevels.js"'));
});

test('Color Match queues framework callbacks until its Unity instance exists', () => {
    const context={delivered:[]};
    vm.runInNewContext(worker.rewrite(`// ColorMatch.data.unityweb
        var unityGameInstance = null;
        unityGameInstance.SendMessage('SaveManager','Ready','saved');
        const unityInstance = {SendMessage: (...args) => delivered.push(args)};
        unityGameInstance = unityInstance;`),context);
    assert.deepEqual(Array.from(context.delivered[0]),['SaveManager','Ready','saved']);
    assert.equal(context.pendingUnityMessages.length,0);
});

test('Soccer Random keeps its keyboard handler executable after export minification', () => {
    let handler, prevented=0;
    const source=`// G-MENBM6GSNY\nwindow.addEventListener('keydown',function(e) { // space and arrow keys if([32,37,38,39,40].includes(e.keyCode)) {e.preventDefault();} });`;
    vm.runInNewContext(worker.rewrite(source),{window:{addEventListener(name,callback){handler=callback;}}});
    handler({keyCode:32,preventDefault(){prevented++;}});
    handler({keyCode:65,preventDefault(){prevented++;}});
    assert.equal(prevented,1);
});

test('TileTopia starts without unregistering the hub worker or clearing its caches', () => {
    const source=`youtube-playables@main/tiletopia/
        <script>navigator.serviceWorker.getRegistration("../..").then(reg=>reg.unregister());caches.delete('game');</script>
        <script>window.addEventListener('load',()=>{navigator.serviceWorker.register("ServiceWorker.js");});createUnityInstance();</script>`;
    const fixed=worker.rewrite(source);
    assert.ok(!fixed.includes('getRegistration') && !fixed.includes('caches.delete') && !fixed.includes('serviceWorker.register'));
    assert.ok(fixed.includes('createUnityInstance()'));
});

test('host-only bridges and missing Draw Climber ads do not stop startup', () => {
    assert.ok(!worker.rewrite('google-class/coreball/<script>window.parent.maeExportApis_();</script>').includes('maeExportApis_'));
    const fixed=worker.rewrite('yrgen73/draw-cl<body onload="sdk.showBanner();"><script>egret.runEgret({});</script>');
    assert.ok(!fixed.includes('sdk.showBanner'));
    assert.ok(fixed.includes('egret.runEgret'));
});

test('Construct workers use a blob entry and resolve their imports against the real script', async () => {
    const body=worker.rewrite('<head><base href="https://cdn.jsdelivr.net/gh/example/repo@main/games/evowars/"></head>');
    const script=body.match(/<script>([\s\S]*?)<\/script>/)[1];
    const context={window:{Worker:class {constructor(path,options){this.path=path;this.options=options;}}},document:{baseURI:'https://cdn.jsdelivr.net/gh/example/repo@main/games/evowars/'},location:{origin:'https://larp.mom'},URL,Blob};
    vm.runInNewContext(script,context);
    const instance=new context.window.Worker('ws_worker.js?1.12.8',{name:'network'});
    assert.ok(instance.path.startsWith('blob:'));
    assert.equal(instance.options.name,'network');
    const imports=[], realm={URL,importScripts:url=>imports.push(url)};realm.self=realm;
    vm.runInNewContext(await (await fetch(instance.path)).text(),realm);
    realm.importScripts('msgpack.min.js');
    assert.deepEqual(imports,['https://esm.sh/gh/example/repo@main/games/evowars/ws_worker.js?1.12.8&raw','https://esm.sh/gh/example/repo@main/games/evowars/msgpack.min.js?raw']);
    URL.revokeObjectURL(instance.path);
    assert.equal(new context.window.Worker('/local.js').path,'/local.js');
});

test('external startup patches keep optional audio and ad callbacks safe', async () => {
    const cases=[
        ['https://cdn.jsdelivr.net/gh/genizy/cc3d-mobile@main/CrazyCattle3D.audio.position.worklet.js',"globalThis.ended = event ? .data ? .type === 'ended';",{event:{data:{type:'ended'}}},ctx=>assert.equal(ctx.ended,true)],
        ['https://cdn.jsdelivr.net/gh/bubbls/youtube-playables@latest/crossy-road/scripts/game.min.js','Game.audioManager.SetVolume(0.8);Game.mute=false;', {Game:{audioManager:null,mute:true}},ctx=>assert.equal(ctx.Game.mute,false)],
        ['https://cdn.jsdelivr.net/gh/wnasmile/LAMAR@main/bobtherobber2/bob-the-robber-2.min.f.js','globalThis.pending = gdsdk.showAd(s.display, {containerId: this.element.id});',{element:{id:'banner'},s:{display:'display'},gdsdk:{showAd:()=>Promise.reject('No ad provider')}},async ctx=>assert.equal(await ctx.pending,undefined)],
        ['https://cdn.jsdelivr.net/gh/Synic-dx/blackJack@main/script.js','drawCardSound.play();globalThis.dealt=true;',{drawCardSound:{play:()=>Promise.reject(new Error('Unsupported optional audio'))}},async ctx=>{await Promise.resolve();assert.equal(ctx.dealt,true);}],
    ];
    for (const [url,source,context,check] of cases) {
        worker.fetch=async()=>new Response(source);
        let pending;
        listeners.fetch({request:new Request(url),respondWith(value){pending=Promise.resolve(value);}});
        vm.runInNewContext(await (await pending).text(),context);
        await check(context);
    }
});

test('OvO can reload its translation helper without redeclaring or clearing its cache', async () => {
    worker.fetch=async()=>new Response('let cache = {}; function remember(){cache.hello="world";}\nasync function getTranslations() {\nthrow Error("Retired sheet");\n}\n\nfunction listLanguages() {}');
    let pending;
    listeners.fetch({request:new Request('https://cdn.jsdelivr.net/gh/Replku/Ovo@123/unlockalllevels.js'),respondWith(value){pending=value;}});
    const source=await (await pending).text(), context={fetch:async url=>{assert.equal(url,'languages.json');return {json:async()=>({languages:{en:'English'}})};},c2_callFunction(){}};
    vm.runInNewContext(source,context);
    context.remember();
    vm.runInNewContext(source,context);
    assert.equal(context.ovoTranslationCache.hello,'world');
    assert.equal((await context.getTranslations()).languages.en,'English');
});

test('Unity unzip helpers request JSZip from the actual game directory', async () => {
    let requested;
    worker.fetch=async url=>{requested=url;return new Response('window.zipReady=true;');};
    for (const game of ['hide-n-seek','city-smash']) {
        let pending;
        listeners.fetch({request:new Request(`https://cdn.jsdelivr.net/gh/bubbls/youtube-playables@main/${game}/main/${game}/lib/jszip.min.js`),respondWith(value){pending=value;}});
        await pending;
        assert.equal(requested,`https://esm.sh/gh/bubbls/youtube-playables@main/${game}/lib/jszip.min.js?raw`);
    }
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
