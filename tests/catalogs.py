"""Run with python3 tests/catalogs.py (requires Playwright and Chromium)."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shutil
from threading import Thread
from urllib.parse import parse_qs, urlsplit
from urllib.parse import quote

from playwright.sync_api import sync_playwright


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


root = Path(__file__).resolve().parents[1]
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
try:
    games = json.loads((root / 'ugs-games.json').read_text())
    assert len({game['id'] for game in games}) == len(games) > 100
    assert all(game['url'].startswith('UGS-Files/') and game['url'].endswith('.html') for game in games)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=shutil.which('chromium'), headless=True)
        for width in [1200, 390]:
            page = browser.new_page(viewport={'width': width, 'height': 850})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(base + '/home.html', wait_until='domcontentloaded')
            assert page.locator('html').evaluate("el => el.classList.contains('dark')")
            page.get_by_role('button', name='Light', exact=True).click()
            page.reload(wait_until='domcontentloaded')
            assert page.evaluate("localStorage.theme") == 'light'
            assert not page.locator('html').evaluate("el => el.classList.contains('dark')")
            page.get_by_role('link', name='UGS', exact=True).click()
            page.wait_for_function("document.querySelectorAll('#grid .zone').length > 0")
            assert page.url == base + '/ugs.html'
            assert not page.locator('html').evaluate("el => el.classList.contains('dark')")
            page.get_by_role('button', name='Dark', exact=True).click()
            assert page.locator('#grid .zone').count() == len(games)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.get_by_role('searchbox').fill('2048')
            page.wait_for_function("document.querySelectorAll('#grid .zone').length < 100")
            assert page.locator('#grid .zone').count() > 0
            page.locator('#grid .zone').filter(has_text='2048').first.click()
            assert page.locator('#viewer').evaluate("el => el.classList.contains('open')")
            assert '/hub/ugs/UGS-Files/' in page.locator('#frame').get_attribute('src')
            assert page.get_by_role('button', name='jsDelivr tab', exact=True).count() == 0
            with page.expect_popup() as opened:
                page.get_by_role('button', name='open game in new tab', exact=True).click()
            popup = opened.value
            popup.wait_for_load_state('domcontentloaded')
            assert urlsplit(popup.url).path.startswith('/hub/ugs/UGS-Files/')
            assert popup.evaluate('window.opener === null')
            popup.close()
            game_id = parse_qs(urlsplit(page.url).query)['id'][0]
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function("document.querySelector('#viewer').classList.contains('open')")
            assert parse_qs(urlsplit(page.url).query)['id'][0] == game_id
            page.locator('#close').click()
            assert not page.locator('#viewer').is_visible()
            assert not urlsplit(page.url).query
            spaced_id = next(game['id'] for game in games if ' ' in game['id'])
            page.goto(base + '/ugs.html?id=' + quote(spaced_id), wait_until='domcontentloaded')
            page.wait_for_function("document.querySelector('#viewer').classList.contains('open')")
            assert parse_qs(urlsplit(page.url).query)['id'][0] == spaced_id
            assert ' ' not in page.locator('#frame').get_attribute('src')
            assert any(c['name'] == 'access_granted' and c['value'] == 'ugs.html' for c in page.context.cookies())
            page.goto(base, wait_until='domcontentloaded')
            assert page.locator('#content-frame').get_attribute('src') == 'ugs.html'
            page.goto(base + '/gnmath.html', wait_until='domcontentloaded')
            page.wait_for_function("document.querySelectorAll('#grid .zone').length > 0")
            assert page.locator('html').evaluate("el => el.classList.contains('dark')")
            assert page.locator('#jsdtab').count() == 1
            page.get_by_role('searchbox').fill('Retro Bowl')
            page.wait_for_function("document.querySelectorAll('#grid .zone').length < 10")
            assert page.locator('#grid .zone').count() > 0
            assert not errors, errors
            page.close()
        browser.close()
    print('Passed: UGS navigation, full catalog, search, viewer, game links, saved tab, mobile layout, gn-math regression')
finally:
    server.shutdown()
    server.server_close()
