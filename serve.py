"""Local test server for the seat house: static files with caching off, plus one small same-origin relay.

    python3 -I serve.py . 8795

/proxy/seats/<n> (n = 0..1999) returns a few fields of api.imd.fun/seats/<n>: tokenId, online, daemonVersion,
pausedByOwnerAt and the 20 newest tasks (nodeKey, role, launch kind, status, submittedAt, the first 100 characters
of the objective). That route sends no CORS header, so a browser cannot read it directly; the full record is
0.2-0.8 MB, so the relay trims it and caches it for 60 s.

/proxy/jobs/<uuid> returns a job's id, state, template, launch kind, each step's role and its oracle question
(api.imd.fun/jobs/<id>, no CORS either): a running task's live event names its step and job, not the job's template
or launch kind, which decide what he does. Cached for 10 minutes.

/proxy/scheduled returns the ids of the jobs and oracle questions that the active and paused schedules opened
(api.imd.fun/schedules and /schedules/<id>, no CORS). Cached for 10 minutes. Listens on 127.0.0.1 only.
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
JOBS = {}
SCHEDULED = [0, b'{"ids": []}']
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


def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'lcp-local/1', 'Accept-Encoding': 'gzip'})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
        if r.headers.get('Content-Encoding') == 'gzip':
            raw = gzip.decompress(raw)
    return json.loads(raw)


def job_record(jid):
    hit = JOBS.get(jid)
    if hit and time.time() - hit[0] < 600:
        return hit[1]
    d = fetch_json(f'https://api.imd.fun/jobs/{jid}')
    j = d.get('job', d)
    launch = j.get('launch') or {}
    out = {'id': j.get('id'), 'state': j.get('state'), 'template': j.get('template'),
           'launch': launch.get('kind') if launch.get('requested') else None,
           'nodes': {n.get('key'): n.get('role') for n in j.get('nodes') or [] if n.get('key')},
           'oracleRequestId': j.get('oracleRequestId')}
    body = json.dumps(out).encode()
    JOBS[jid] = (time.time(), body)
    return body


def scheduled_ids():
    if time.time() - SCHEDULED[0] < 600:
        return SCHEDULED[1]
    ids = []
    for sch in fetch_json('https://api.imd.fun/schedules?limit=100').get('schedules', []):
        if sch.get('status') not in ('active', 'paused'):
            continue
        d = fetch_json(f"https://api.imd.fun/schedules/{sch['id']}")
        d = d.get('schedule', d)
        for run in d.get('latest') or []:
            res = run.get('result') or {}
            if res.get('id'):
                ids.append(res['id'])
    SCHEDULED[0], SCHEDULED[1] = time.time(), json.dumps({'ids': ids}).encode()
    return SCHEDULED[1]


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass

    def do_GET(self):
        path = self.path.split('?')[0]
        m = re.fullmatch(r'/proxy/seats/(\d{1,4})', path)
        j = re.fullmatch(r'/proxy/jobs/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', path)
        if path == '/proxy/scheduled':
            try:
                return self.send_json(scheduled_ids())
            except Exception as e:  # noqa: BLE001 - report, never crash the server
                return self.send_error(502, f'schedules unavailable: {type(e).__name__}')
        if not m and not j:
            return super().do_GET()
        if m and int(m.group(1)) >= 2000:
            return self.send_error(404, 'no such seat')
        try:
            body = seat_record(int(m.group(1))) if m else job_record(j.group(1))
        except Exception as e:  # noqa: BLE001 - report, never crash the server
            return self.send_error(502, f'record unavailable: {type(e).__name__}')
        self.send_json(body)

    def send_json(self, body):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    root, port = sys.argv[1], int(sys.argv[2])
    http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Handler, directory=root)).serve_forever()
