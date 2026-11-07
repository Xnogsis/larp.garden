"""Deterministic catalog/game fixtures served through the real service worker."""
from http.server import SimpleHTTPRequestHandler
from urllib.parse import parse_qs, urlsplit, unquote
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ADAPTER = r'''
const fixtureFetch = self.fetch.bind(self);
self.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const game = /\/gh\/Xnogsis\/(?:html|ugs-singlefile|html55-new|Biotomata-Game|Prestige-Tree)@([a-f0-9]{40})\/(.+?)(?:\?raw)?$/.exec(url);
    if (game) return fixtureFetch('/fixture/' + encodeURIComponent(game[2]) + '?ref=' + game[1] + '&mirror=' + (url.includes('esm.sh') ? 'esm' : 'jsdelivr') + '&method=' + (init?.method || 'GET'));
    return fixtureFetch(input, init);
};
'''


class CatalogHandler(SimpleHTTPRequestHandler):
    fail_games = False
    attempts = []
    worker_revision = 1

    def log_message(self, *_):
        pass

    def copyfile(self, source, outputfile):
        try:
            super().copyfile(source, outputfile)
        except (BrokenPipeError, ConnectionResetError):
            pass  # Navigation may cancel a lazy thumbnail or fixture response.

    def do_GET(self):
        parsed = urlsplit(self.path)
        if parsed.path == '/sw.js':
            revision = type(self).worker_revision
            probe = f'''\nself.addEventListener('message', event => {{ if (event.data === 'fixture-revision') event.source.postMessage({{revision: {revision}}}); }});
self.addEventListener('install', event => event.waitUntil(new Promise(resolve => setTimeout(resolve, 250))));
'''
            body = (ADAPTER + (ROOT / 'sw.js').read_text() + probe).encode()
            mime, code = 'text/javascript', 200
        elif parsed.path.startswith('/fixture/'):
            query = parse_qs(parsed.query)
            type(self).attempts.append((unquote(parsed.path), query))
            body = b'Unavailable' if type(self).fail_games else b'<!doctype html><title>Fixture game</title><button id="game-control">Play</button><canvas width="10" height="10"></canvas><script src=""></script><script async src="  "></script>'
            if not type(self).fail_games and Path(unquote(parsed.path)).name.split('.')[0].split('-')[0] == '3':
                body = b'<!doctype html><title>Broken game</title><script>throw new Error("fixture startup failed")</script>'
            mime, code = 'text/html', 503 if type(self).fail_games else 200
        else:
            return super().do_GET()
        self.send_response(code)
        self.send_header('Content-Type', mime)
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)
