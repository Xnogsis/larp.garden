"""Run with python3 tests/tv.py (Playwright and system Chromium)."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
from threading import Thread

from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[1]
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
origin = f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=shutil.which('chromium'))
        for width in (320, 390, 768, 1200):
            context = browser.new_context(viewport={'width': width, 'height': 850})
            context.route('https://**/*', lambda route: route.fulfill(body='<h1>External destination</h1>'))
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(origin + '/home.html')
            page.get_by_role('link', name='Tv', exact=True).click()
            assert page.url == origin + '/tv.html'
            assert page.locator('nav [aria-current]').inner_text() == 'Tv'
            assert page.locator('.tv-action').count() == 0
            assert page.locator('#tv-form').bounding_box()['y'] < page.locator('#tv-help').bounding_box()['y']
            for theme in ('dark', 'light'):
                if page.locator('html').evaluate("el => el.classList.contains('dark')") != (theme == 'dark'):
                    page.locator('#theme').click()
                page.reload()
                assert page.locator('html').evaluate("el => el.classList.contains('dark')") == (theme == 'dark')
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            for link in page.locator('main a:visible').all():
                with page.expect_popup() as opened:
                    link.click()
                popup = opened.value
                popup.wait_for_load_state()
                assert popup.url == link.get_attribute('href')
                assert popup.evaluate('window.opener === null')
                popup.close()
            page.locator('#tv-form button').click()
            assert page.locator('#tv-player').is_hidden()
            page.locator('#tmdb-id').fill('94605')
            page.locator('#tv-type').select_option('tv')
            page.locator('#tv-form button').click()
            expected = 'https://0vidads.top/embed/tv/94605/1/1?branding=larp.surf&loading=2&back=false'
            assert page.locator('#tv-frame').get_attribute('src') == expected
            assert page.locator('#tv-external').get_attribute('href') == expected
            assert page.locator('#tv-player').is_visible()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.locator('#tv-stop').click()
            assert not errors, (width, errors)
            expect(page.locator('#tv-player')).to_be_hidden()
            assert page.locator('#tv-frame').get_attribute('src') is None
            page.locator('#tv-type').select_option('movie')
            page.locator('#tmdb-id').fill('1339713')
            assert page.locator('#season').is_disabled()
            page.locator('#tv-form button').click()
            expect(page.locator('#tv-frame')).to_have_attribute('src', 'https://0vidads.top/embed/movie/1339713?branding=larp.surf&loading=2&back=false')
            page.locator('#tv-stop').click()
            page.locator('.home-notice-toggle').click()
            assert page.locator('.home-notice-toggle').get_attribute('aria-pressed') == 'true'
            page.goto(origin)
            assert page.locator('#content-frame').get_attribute('src') == 'tv.html'
            assert not errors, errors
            context.close()
        browser.close()
    print('Passed: tv navigation, external links, saved themes, mobile layout, notice, saved tab')
finally:
    server.shutdown()
    server.server_close()
