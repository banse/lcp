"""IMD Explorer and Little Computer Pepes side by side, local only.

    python3 -I tools/side-by-side/side_by_side.py [port]   # from the lcp folder; default 8798; then open
                                                           # http://127.0.0.1:8798/side-by-side (?seat=N, ?job=<id>)

explorer.imd.fun forbids being shown in a frame (Content-Security-Policy: frame-ancestors 'none'), so this server
passes the explorer through 127.0.0.1, GET and HEAD only, with that one directive and X-Frame-Options removed.
Everything else the explorer sends stays as it is, except cookies (the browser sends every 127.0.0.1 cookie to
every local port, so none go out and none come back) and one <style> added to its HTML pages: HIDE takes the top
bar's links to other IMD sites (Launch, $IMD, Docs), Telegram, Connect and the menu out of the pane; the IMD mark,
the Explorer tab and the light/dark switch stay, the switch at every width (the explorer itself moves it into the
menu below 640px). The explorer keeps its mode in localStorage `imd-theme`, which here is this server's origin, so
the two-pane page reads it and dresses itself and the house the same way.

/side-by-side is the two-pane page (side-by-side.html next to this file). Its left pane is the lcp server at
127.0.0.1:8795, which runs on its own (`python3 -I serve.py . 8795` in the lcp checkout); /side-by-side/lcp says
whether it answers. /side-by-side/jobs lists the jobs not over yet (state not completed, blocked, failed or
cancelled) among the newest 200 of api.imd.fun/jobs, which has no state filter and no CORS; cached 15 s.
Listens on 127.0.0.1 only.
"""
import gzip
import http.client
import http.server
import json
import pathlib
import sys
import time
import urllib.request

UPSTREAM = 'explorer.imd.fun'
LCP = 'http://127.0.0.1:8795/'
PAGE = pathlib.Path(__file__).with_name('side-by-side.html')
# request headers that stay here: hop-by-hop, our host, local cookies and credentials, compression (bodies pass as is)
KEEP_LOCAL = {'host', 'connection', 'keep-alive', 'proxy-connection', 'te', 'upgrade', 'accept-encoding', 'cookie',
              'authorization', 'origin', 'referer'}
# response headers that do not come back: hop-by-hop, the length (set again), the frame ban, cookies, HTTPS-only hints
DROP = {'connection', 'keep-alive', 'transfer-encoding', 'content-length', 'x-frame-options', 'set-cookie',
        'strict-transport-security', 'alt-svc'}
HIDE = (b'<style id="side-by-side">'
        b'header.nav nav.sites a[href="/launch"], header.nav nav.sites a[href^="https://imd.fun/token"],'
        b' header.nav nav.sites a[href^="https://imd.fun/docs"], header.nav .nav-tools > a.nav-icon,'
        b' header.nav .nav-wallet, header.nav .nav-drawer { display: none !important; }'
        b' header.nav .nav-tools > button.nav-icon { display: flex !important; margin-left: 0 !important; }</style>')


def unframed(csp):
    parts = [d.strip() for d in csp.split(';')]
    return '; '.join(d for d in parts if d and not d.lower().startswith('frame-ancestors'))


ENDED = ('completed', 'blocked', 'failed', 'cancelled')
ACTIVE = [0, b'']


def active_jobs():
    if time.time() - ACTIVE[0] < 15:
        return ACTIVE[1]
    req = urllib.request.Request('https://api.imd.fun/jobs?limit=200',
                                 headers={'User-Agent': 'lcp-side-by-side/1', 'Accept-Encoding': 'gzip'})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
        if r.headers.get('Content-Encoding') == 'gzip':
            raw = gzip.decompress(raw)
    jobs = [{'id': j.get('id'), 'state': j.get('state'), 'template': j.get('template'), 'launchKind': j.get('launchKind'),
             'objective': (j.get('objective') or '')[:140], 'createdAt': j.get('createdAt')}
            for j in json.loads(raw).get('jobs') or [] if j.get('id') and j.get('state') not in ENDED]
    ACTIVE[0], ACTIVE[1] = time.time(), json.dumps({'jobs': jobs}).encode()
    return ACTIVE[1]


def lcp_up():
    try:
        with urllib.request.urlopen(LCP, timeout=3) as r:
            return r.status == 200
    except OSError:
        return False


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0].rstrip('/') == '/side-by-side':        # ?seat=N&job=<id> is read by the page
            return self.send_bytes(200, 'text/html; charset=utf-8', PAGE.read_bytes())
        if self.path == '/side-by-side/lcp':
            return self.send_bytes(200, 'application/json', json.dumps({'up': lcp_up()}).encode())
        if self.path == '/side-by-side/jobs':
            try:
                return self.send_bytes(200, 'application/json', active_jobs())
            except Exception as e:  # noqa: BLE001 - report, never crash the server
                return self.send_bytes(502, 'application/json', json.dumps({'error': type(e).__name__}).encode())
        self.relay()

    do_HEAD = do_GET

    def send_bytes(self, status, ctype, body):
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def relay(self):
        headers = {k: v for k, v in self.headers.items() if k.lower() not in KEEP_LOCAL}
        headers['Accept-Encoding'] = 'identity'
        conn = http.client.HTTPSConnection(UPSTREAM, timeout=30)
        try:
            conn.request(self.command, self.path, headers=headers)
            r = conn.getresponse()
            body = r.read()
        except OSError as e:
            print(f'{self.command} {self.path}: {UPSTREAM} did not answer ({e})', file=sys.stderr)
            return self.send_bytes(502, 'text/plain; charset=utf-8', f'{UPSTREAM} did not answer: {e}\n'.encode())
        finally:
            conn.close()
        if (r.getheader('Content-Type') or '').startswith('text/html') and not r.getheader('Content-Encoding'):
            body = body.replace(b'</head>', HIDE + b'</head>', 1)
        self.send_response(r.status)
        here = f'http://127.0.0.1:{self.server.server_port}'
        for k, v in r.getheaders():
            low = k.lower()
            if low in DROP:
                continue
            if low == 'content-security-policy':
                v = unframed(v)
                if not v:
                    continue
            if low == 'location':
                v = v.replace(f'https://{UPSTREAM}', here)
            self.send_header(k, v)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8798
    server = http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print(f'side by side: http://127.0.0.1:{port}/side-by-side  (lcp {"answers" if lcp_up() else "is NOT running"} at {LCP})',
          flush=True)
    server.serve_forever()
