"""Check the shared header notice across navigation and reduced-motion layouts."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
from threading import Thread

from playwright.sync_api import sync_playwright


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


root = Path(__file__).resolve().parents[1]
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=shutil.which('chromium'))
        context = browser.new_context(viewport={'width': 1440, 'height': 900}, service_workers='block')
        origin = f'http://127.0.0.1:{server.server_port}'
        context.route('**/*', lambda route: route.continue_()
                      if route.request.url.startswith(origin + '/') else route.abort())
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(origin + '/home.html')
        text = page.locator('.home-notice-window span')
        toggle = page.locator('.home-notice-toggle')
        text.evaluate('(el) => el.getAnimations()[0].currentTime = 10000')

        for tab in ['Games', 'UGS', 'Home']:
            page.locator('#top nav').get_by_role('link', name=tab, exact=True).click()
            assert text.count() == 1
            assert text.inner_text() == "notepad method patched soon, don't get caught with x-vpn."
            assert text.evaluate('(el) => el.getAnimations()[0].currentTime') >= 10000
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')

        toggle.click()
        page.mouse.move(0, 500)
        toggle.evaluate('(el) => el.blur()')
        stopped = text.evaluate('(el) => el.getAnimations()[0].currentTime')
        page.locator('#top nav').get_by_role('link', name='Games', exact=True).click()
        assert toggle.get_attribute('aria-pressed') == 'true'
        assert abs(text.evaluate('(el) => el.getAnimations()[0].currentTime') - stopped) < 100
        assert text.evaluate('(el) => getComputedStyle(el).animationPlayState') == 'paused'
        page.go_back()
        assert toggle.get_attribute('aria-pressed') == 'true'
        assert abs(text.evaluate('(el) => el.getAnimations()[0].currentTime') - stopped) < 100
        toggle.click()
        page.mouse.move(0, 500)
        toggle.evaluate('(el) => el.blur()')
        assert text.evaluate('(el) => getComputedStyle(el).animationPlayState') == 'running'

        page.set_viewport_size({'width': 360, 'height': 800})
        for tab in ['Games', 'UGS', 'Home']:
            page.locator('#top nav').get_by_role('link', name=tab, exact=True).click()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert page.locator('.home-notice-window').bounding_box()['width'] > 100
        page.emulate_media(reduced_motion='reduce')
        assert text.evaluate('(el) => getComputedStyle(el).animationName') == 'none'
        assert toggle.is_hidden()
        assert text.bounding_box()['height'] > 25
        assert not errors, errors

        # Browsers that disable storage should still display a working notice.
        context.add_init_script("Object.defineProperty(window, 'sessionStorage', {get() {throw new Error('disabled');}})")
        page.reload()
        assert text.is_visible()
        assert not errors, errors
        browser.close()
        print('Notice navigation, pause, Back, mobile, reduced motion, and disabled-storage checks passed.')
finally:
    server.shutdown()
