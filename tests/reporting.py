"""Reporting UI and automatic dedupe use a mock relay. No real Discord messages."""
from functools import partial
from http.server import ThreadingHTTPServer
from threading import Thread
from urllib.parse import urlsplit
import json
import shutil
import time
from playwright.sync_api import sync_playwright, expect
from browser_support import CatalogHandler, ROOT

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(CatalogHandler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
reports = []
fail_delivery = False
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=shutil.which('chromium'), headless=True)
        context = browser.new_context(locale='en-US')
        context.route('**/game-reporting-config.js', lambda route: route.fulfill(content_type='text/javascript', body="window.GAME_REPORTING={endpoint:'https://reports.test',enabled:true};"))
        def relay(route):
            headers = {'Access-Control-Allow-Origin':base, 'Access-Control-Allow-Headers':'Content-Type, X-Report-Token', 'Access-Control-Allow-Methods':'GET, POST, OPTIONS'}
            if route.request.method == 'OPTIONS':
                return route.fulfill(status=204, headers=headers)
            if urlsplit(route.request.url).path == '/v1/session':
                return route.fulfill(headers=headers, content_type='application/json', body=json.dumps({'token':'test-session', 'expiresAt':int(time.time()*1000)+300000}))
            assert route.request.headers.get('x-report-token') == 'test-session'
            if fail_delivery:
                return route.fulfill(status=503, headers=headers, content_type='application/json', body='{}')
            reports.append(route.request.post_data_json)
            return route.fulfill(headers=headers, content_type='application/json', body='{"ok":true,"reportId":"test-report"}')
        context.route('https://reports.test/**', relay)
        page = context.new_page()
        page.goto(base + '/gnmath.html?id=0', wait_until='domcontentloaded')
        expect(page.locator('#viewer')).to_be_visible()
        page.evaluate("GameDiagnostics.note('error', 'Crash at https://assets.example/game.js?token=private-value#private-fragment')")
        page.wait_for_timeout(1800)
        assert len(reports) == 1, reports
        assert reports[0]['mode'] == 'auto' and reports[0]['game']['id'] == '0'
        assert 'private-value' not in json.dumps(reports)
        assert 'private-fragment' not in json.dumps(reports)
        expect(page.locator('#game-feedback')).not_to_be_visible()
        # The script event and viewer error coalesce; a repeated crash is deduplicated.
        page.evaluate("for(let i=0;i<10;i++) GameDiagnostics.note('error', 'Crash at https://assets.example/game.js?token=private-value#private-fragment')")
        page.wait_for_timeout(1500)
        assert len(reports) == 1
        page.locator('#viewer-options summary').click()
        page.locator('#auto-reports').uncheck()
        page.evaluate("GameDiagnostics.note('error','Different error while opted out')")
        page.wait_for_timeout(1500)
        assert len(reports) == 1
        page.locator('#report-game').click()
        expect(page.locator('#report-dialog')).to_be_visible()
        expect(page.locator('#report-description')).to_be_focused()
        page.keyboard.press('Escape')
        expect(page.locator('#report-dialog')).not_to_be_visible()
        expect(page.locator('#viewer')).to_be_visible()
        # A manual report works while automatic reporting is disabled.
        page.locator('#viewer-options summary').click()
        page.locator('#report-game').click()
        page.locator('#report-description').fill('The game froze after selecting the first level.')
        preview = page.locator('#report-preview').text_content()
        assert 'private-value' not in preview
        page.locator('#send-report').click()
        expect(page.locator('#report-result')).to_have_text('Report sent. Thank you.')
        assert len(reports) == 2 and reports[1]['mode'] == 'manual'
        assert reports[1]['description'].startswith('The game froze')
        assert not any(key in reports[1] for key in ['cookies','saves','storage','screenshot'])
        fail_delivery = True
        page.locator('#send-report').click()
        expect(page.locator('#report-result')).to_have_text('Could not send the report. Please try again later.')
        expect(page.locator('#send-report')).to_be_enabled()
        expect(page.locator('#game-feedback')).not_to_be_visible()
        page.locator('#cancel-report').click()
        page.reload(wait_until='domcontentloaded')
        expect(page.locator('#viewer')).to_be_visible()
        assert not page.locator('#auto-reports').is_checked()
        browser.close()
    print('Passed: manual reporting, automatic coalescing/dedupe, opt-out persistence, redaction, dialog keyboard focus and failure recovery; no real webhooks called')
finally:
    server.shutdown()
    server.server_close()
