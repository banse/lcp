"""Local test server for the seat house: static files with caching off, plus one small same-origin relay.

    python3 -I serve.py . 8795

/proxy/seats/<n> (n = 0..1999) returns a few fields of api.imd.fun/seats/<n>: tokenId, online, daemonVersion,
pausedByOwnerAt and the 20 newest tasks (nodeKey, role, launch kind, status, submittedAt, the first 100 characters
of the objective). That route sends no CORS header, so a browser cannot read it directly; the full record is
0.2-0.8 MB, so the relay trims it and caches it for 60 s. Listens on 127.0.0.1 only.
"""
import functools
import gzip
import http.server
import json
import re
import sys
import time
import urllib.request

CACHE = {}
FIELDS = ('tokenId', 'online', 'daemonVersion', 'pausedByOwnerAt')


def seat_record(n):
    hit = CACHE.get(n)
    if hit and time.time() - hit[0] < 60:
        return hit[1]
    req = urllib.request.Request(f'https://api.imd.fun/seats/{n}',
                                 headers={'User-Agent': 'lcp-local/1', 'Accept-Encoding': 'gzip'})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
        if r.headers.get('Content-Encoding') == 'gzip':
            raw = gzip.decompress(raw)
    d = json.loads(raw)
    d = d.get('seat', d)
    out = {k: d.get(k) for k in FIELDS}
    out['recent'] = [{'nodeKey': t.get('nodeKey'), 'role': t.get('role'), 'launch': t.get('launch'), 'status': t.get('status'),
                      'submittedAt': t.get('submittedAt'), 'jobId': t.get('jobId'), 'objective': (t.get('objective') or '')[:100]}
                     for t in (d.get('work') or [])[:20]]
    body = json.dumps(out).encode()
    CACHE[n] = (time.time(), body)
    return body


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass

    def do_GET(self):
        m = re.fullmatch(r'/proxy/seats/(\d{1,4})', self.path.split('?')[0])
        if not m:
            return super().do_GET()
        n = int(m.group(1))
        if n >= 2000:
            return self.send_error(404, 'no such seat')
        try:
            body = seat_record(n)
        except Exception as e:  # noqa: BLE001 - report, never crash the server
            return self.send_error(502, f'seat record unavailable: {type(e).__name__}')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    root, port = sys.argv[1], int(sys.argv[2])
    http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Handler, directory=root)).serve_forever()
