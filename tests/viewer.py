"""Desktop journeys: entry, URLs/history, focus, loading recovery and Home discovery."""
from functools import partial
from http.server import ThreadingHTTPServer
from threading import Thread
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from browser_support import CatalogHandler, ROOT

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(CatalogHandler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=shutil.which('chromium'), headless=True)
        page = browser.new_page(viewport={'width': 1280, 'height': 850})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base + '/')
        expect(page).to_have_title('Clever')
        page.keyboard.press('Tab')
        assert page.url == base + '/'
        assert page.locator('#fake-404').is_visible()
        page.keyboard.press('Enter')
        page.wait_for_url(base + '/gnmath.html')
        page.locator('#grid .zone').first.wait_for()
        # A new worker must control the catalog before a returning visitor plays.
        CatalogHandler.worker_revision = 2
        page.reload(wait_until='domcontentloaded')
        page.locator('#grid .zone').first.wait_for()
        revision = page.evaluate('''() => new Promise(resolve => {
            navigator.serviceWorker.addEventListener('message', event => { if (event.data.revision) resolve(event.data.revision); }, {once:true});
            navigator.serviceWorker.controller.postMessage('fixture-revision');
        })''')
        assert revision == 2
        card = page.locator('#grid .zone').first
        name = card.inner_text()
        card.click()
        page.wait_for_url(base + '/gnmath.html?id=0')
        expect(page.locator('#close')).to_be_focused()
        expect(page).to_have_title('Clever')
        assert page.locator('main').evaluate('el => el.inert')
        assert page.locator('#viewer').get_attribute('aria-modal') == 'true'
        expect(page.locator('#game-status')).to_contain_text('Game page loaded')
        # Desktop primary actions remain directly reachable; technical choices are disclosed.
        for selector in ['#close', '#fullscreen', '#viewer-options summary']:
            box = page.locator(selector).bounding_box()
            assert box and box['x'] >= 0 and box['x'] + box['width'] <= 1280
        assert not page.locator('#blank').is_visible()
        page.go_back()
        expect(page.locator('#viewer')).not_to_be_visible()
        expect(page).to_have_title('Clever')
        expect(card).to_be_focused()
        assert not page.locator('main').evaluate('el => el.inert')
        page.go_forward()
        expect(page.locator('#viewer')).to_be_visible()
        page.frame_locator('#frame').locator('#game-control').press('Tab')
        expect(page.locator('#close')).to_be_focused()
        page.frame_locator('#frame').locator('#game-control').focus()
        page.frame_locator('#frame').locator('#game-control').press('Escape')
        expect(page.locator('#viewer')).not_to_be_visible()
        page.wait_for_url(base + '/gnmath.html')
        expect(card).to_be_focused()
        # A shared URL opens the game and Back returns to the catalog.
        page.goto(base + '/gnmath.html?id=0')
        expect(page.locator('#viewer')).to_be_visible()
        page.go_back()
        expect(page.locator('#viewer')).not_to_be_visible()
        page.wait_for_url(base + '/gnmath.html')
        page.get_by_role('searchbox').fill('zzzz-no-such-game')
        expect(page.locator('#empty-state')).to_be_visible()
        expect(page.locator('#other-catalog')).to_have_attribute('href', 'ugs.html?q=zzzz-no-such-game')
        page.locator('#clear-search').click()
        expect(page.locator('#empty-state')).not_to_be_visible()
        expect(page.get_by_role('searchbox')).to_be_focused()
        # A fast search-and-click can replace the opening card during playback.
        page.evaluate('''() => {
            const search = document.getElementById('search');
            search.value = 'Bowmasters';
            search.dispatchEvent(new Event('input'));
            const card = document.querySelector('#grid .zone');
            card.focus(); card.click();
        }''')
        page.wait_for_function("document.querySelectorAll('#grid .zone').length === 1")
        page.keyboard.press('Escape')
        expect(page.locator('#grid .zone').first).to_be_focused()
        page.wait_for_url(base + '/gnmath.html')
        # Unknown deep links explain the problem instead of silently displaying nothing.
        page.goto(base + '/gnmath.html?id=not-a-game')
        expect(page.locator('#status')).to_contain_text('no longer in this catalog')
        # Failed mirror responses are visible and retry bypasses cache.
        CatalogHandler.fail_games = True
        page.goto(base + '/gnmath.html?id=1')
        expect(page.locator('#game-status')).to_contain_text('source returned an error', timeout=20000)
        CatalogHandler.fail_games = False
        CatalogHandler.attempts.clear()
        page.locator('#alternate-source').click()
        expect(page.locator('#game-status')).to_contain_text('Game page loaded')
        assert CatalogHandler.attempts[0][1]['mirror'] == ['jsdelivr']
        assert len(CatalogHandler.attempts[0][1]['ref'][0]) == 40
        assert 'retry=' in page.locator('#frame').get_attribute('src')
        page.locator('#close').click()
        expect(page.locator('#viewer')).not_to_be_visible()
        # Errors raised before iframe load reach the visible recovery controls.
        page.goto(base + '/gnmath.html?id=3')
        expect(page.locator('#game-status')).to_contain_text('game reported an error')
        assert len(errors) == 1 and 'fixture startup failed' in errors[0], errors
        errors.clear()
        page.locator('#close').click()
        expect(page.locator('#viewer')).not_to_be_visible()
        # Home puts playing first and persists a recent-game link.
        page.goto(base + '/home.html')
        expect(page.locator('#recent-games')).to_contain_text('OvO')
        expect(page.locator('#featured-games')).to_have_count(0)
        assert not page.locator('.older-updates').get_attribute('open')
        assert page.get_by_role('link', name='Tv', exact=True).count() == 0
        page.locator('#clear-recent').click()
        expect(page.locator('#recent-empty')).to_be_visible()
        # A failed catalog load offers a visible retry action.
        ctx = browser.new_context(service_workers='block')
        broken = ctx.new_page()
        broken.route('**/zones.json', lambda route: route.fulfill(status=503, body='Unavailable'))
        broken.route('https://**/*', lambda route: route.abort())
        broken.goto(base + '/gnmath.html')
        expect(broken.locator('#catalog-retry')).to_be_visible(timeout=20000)
        assert not errors, errors
        browser.close()
    print('Passed: desktop entry, service-worker upgrades, canonical URLs, Back/Forward, shared links, focus/Escape, empty states, source retry, pinned refs, Home discovery and catalog failure')
finally:
    server.shutdown()
    server.server_close()
