"""Verify source coverage and documented URL formats with external frames mocked."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
from threading import Thread
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


# Independent examples from the references in docs/tv-sources.md.
plain = 'vidfast.vc vidfast.xyz vidfast.pm vidfast.net vidfast.me vidfast.io vidfast.in vidflix.club vidlink.pro vidnest.fun vidrock.net vixsrc.to vidup.to vidzen.fun'.split()
embedded = 'vidstuck.cc zxcstream.cc 2embed.stream nontongo.win vidsrc.sh vidsrc2.ru vidsrc.ir vsembed.ru vsembed.su vidsrc.to'.split()
examples = {host: (f'https://{host}/movie/550', f'https://{host}/tv/1399/2/3') for host in plain}
examples.update({host: (f'https://{host}/embed/movie/550', f'https://{host}/embed/tv/1399/2/3') for host in embedded})
for host in ('vidstuck.cc', 'zxcstream.cc'):
    examples[host] = tuple(url + '?branding=larp.surf&loading=2&back=false' for url in examples[host])
examples.update({
    '0vidads.top': ('https://0vidads.top/embed/movie/550?branding=larp.surf&loading=2&back=false', 'https://0vidads.top/embed/tv/1399/2/3?branding=larp.surf&loading=2&back=false'),
    'www.2embed.cc': ('https://www.2embed.cc/embed/550', 'https://www.2embed.cc/embedtv/1399&s=2&e=3'),
    '2embed.skin': ('https://2embed.skin/embed/550', 'https://2embed.skin/embedtv/1399&s=2&e=3'),
    'embed.atlantic.st': ('https://atlantic.st/embed/movie/550', 'https://atlantic.st/embed/tv/1399/2/3'),
    'cinemaos.tech': ('https://cinemaos.tech/player/550', 'https://cinemaos.tech/player/1399/2/3'),
    'cinesrc.st': ('https://cinesrc.st/embed/movie/550', 'https://cinesrc.st/embed/tv/1399?s=2&e=3'),
    'cinextream.cc': ('https://cinextream.cc/api/embed/movie/550', 'https://cinextream.cc/api/embed/tv/1399/2/3'),
    'cinezo.live': ('https://player.cinezo.live/embed/movie/550', 'https://player.cinezo.live/embed/tv/1399/2/3'),
    'fmov.my': ('https://fmov.my/embed/movie/550', 'https://fmov.my/embed/tv/1399/2/3'),
    'framextv.xyz': ('https://framextv.cc/embed/movie/550', 'https://framextv.cc/embed/tv/1399/2/3'),
    'mappletv.uk': ('https://mapple.fun/watch/movie/550', 'https://mapple.fun/watch/tv/1399-2-3'),
    'web.nxsha.app': ('https://web.nxsha.app/embed/movie/550', 'https://web.nxsha.app/embed/tv/1399/2/3'),
    'primesrc.me': ('https://primesrc.me/embed/movie?tmdb=550', 'https://primesrc.me/embed/tv?tmdb=1399&season=2&episode=3'),
    'www.superembed.stream': ('https://multiembed.mov/?video_id=550&tmdb=1', 'https://multiembed.mov/?video_id=1399&tmdb=1&s=2&e=3'),
    'stellar.rip': ('https://stellar.rip/en/watch/embed/movie/550', 'https://stellar.rip/en/watch/embed/tv/1399-2-3'),
    'velarium.cc': ('https://velarium.cc/en/watch/movie/550', 'https://velarium.cc/en/watch/tv/1399-2-3'),
    'vidapi.ru': ('https://vaplayer.ru/embed/movie/550', 'https://vaplayer.ru/embed/tv/1399/2/3'),
    'www.viduki.net': ('https://viduki.net/1/movie/550', 'https://viduki.net/1/tv/1399/2/3'),
    'vidcore.net': ('https://vidcore.io/movie/550', 'https://vidcore.io/tv/1399/2/3'),
    'www.vidcore.org': ('https://vidcore.org/embed/movie/550', 'https://vidcore.org/embed/tv/1399/2/3'),
    'vidrift.net': ('https://embed.vidrift.net/embed/movie/550', 'https://embed.vidrift.net/embed/tv/1399/2/3'),
    'www.vidy.st': ('https://vidy.st/movie/550', 'https://vidy.st/tv/1399/2/3'),
})
anime = {
    'embed.animetvplus.site': ('MyAnimeList', 'https://embed.animetvplus.site/16498/3'),
    'tryembed.us.cc': ('AniList', 'https://tryembed.us.cc/embed/anime/16498/3/sub'),
    'vidhawk.buzz': ('AniList', 'https://vidhawk.buzz/embed/ani/16498/3/sub'),
}
website_only = {'vidzee.wtf', 'vyla.cc', 'zoryva.me'}
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=shutil.which('chromium'))
        page = browser.new_page(viewport={'width': 390, 'height': 850})
        page.route('https://**/*', lambda route: route.fulfill(body='Mock provider frame'))
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/tv.html')
        select = page.locator('#tv-source')
        keys = set(select.locator('option').evaluate_all('(els) => els.map(e => e.value)'))
        assert keys == set(examples) | set(anime) | website_only
        assert len(keys) == select.locator('option').count() == 52
        for source, urls in examples.items():
            select.select_option(source)
            expect(page.locator('#tv-player')).to_be_hidden()
            for kind, title_id, expected in zip(('movie', 'tv'), ('550', '1399'), urls):
                page.locator('#tv-type').select_option(kind)
                page.locator('#tmdb-id').fill(title_id)
                if kind == 'tv':
                    page.locator('#season').fill('2')
                    page.locator('#episode').fill('3')
                page.locator('#tv-form button').click()
                expect(page.locator('#tv-frame')).to_have_attribute('src', expected)
                expect(page.locator('#tv-external')).to_have_attribute('href', expected)
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        for source, (id_type, expected) in anime.items():
            select.select_option(source)
            assert page.locator('#tv-type').input_value() == 'anime'
            assert page.locator('#tv-id-label').inner_text() == id_type + ' ID'
            assert page.locator('#season').is_disabled()
            page.locator('#tmdb-id').fill('16498')
            page.locator('#episode').fill('3')
            page.locator('#tv-form button').click()
            expect(page.locator('#tv-frame')).to_have_attribute('src', expected)
        select.select_option('0vidads.top')
        assert page.locator('#tmdb-id').input_value() == ''
        for bad_id in ('', 'tt12345', '../550', '550?test=1', '0'):
            page.locator('#tmdb-id').fill(bad_id)
            page.locator('#tv-form button').click()
            assert page.locator('#tv-frame').get_attribute('src') is None
        for source in website_only:
            select.select_option(source)
            assert page.locator('#tv-form button').is_disabled()
            assert page.locator('#tv-frame').get_attribute('src') is None
            assert page.locator('#tv-source-site').get_attribute('href').startswith('https://')
            assert page.locator('#tv-source-note').inner_text()
        assert not errors, errors
        browser.close()
    print(f'Passed: {len(examples) * 2 + len(anime)} documented player URLs, all 52 sources, source switching, ID validation, website-only states, mobile layout')
finally:
    server.shutdown()
    server.server_close()
