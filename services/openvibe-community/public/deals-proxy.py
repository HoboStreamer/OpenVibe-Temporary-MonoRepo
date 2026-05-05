#!/usr/bin/env python3
"""Proxy: fast food deals via DDG, free/broken items via Craigslist jsonsearch."""
import datetime
import json
import re
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36'
DEALS_QUERY = 'fast food deals sales coupons Killeen TX'
CL_BASE     = 'https://killeen.craigslist.org'

HTML_ENTITIES = {'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'"}

def unescape(s):
    for k, v in HTML_ENTITIES.items():
        s = s.replace(k, v)
    return s.strip()

# ── Craigslist jsonsearch ───────────────────────────────────────────────────

def flatten(obj):
    out = []
    def _walk(o):
        if isinstance(o, list):
            for x in o: _walk(x)
        elif isinstance(o, dict):
            out.append(o)
    _walk(obj)
    return out

def fetch_findit(query=''):
    if query:
        # search all categories with user query
        url = CL_BASE + '/jsonsearch/sss/?sort=date&query=' + urllib.parse.quote(query)
    else:
        # free stuff category
        url = CL_BASE + '/jsonsearch/zip/?sort=date'

    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    raw = urllib.request.urlopen(req, timeout=12).read().decode('utf-8', errors='replace')
    items = flatten(json.loads(raw))

    results = []
    for item in items:
        title = item.get('PostingTitle') or ''
        link  = item.get('PostingURL') or ''
        price = item.get('price') or '$0'
        thumb = item.get('ImageThumb') or ''
        ts    = item.get('PostedDate') or 0

        if not title or not link:
            continue

        # upsize thumbnail from 50x50c → 600x450
        image = re.sub(r'\d+x\d+c?\.jpg$', '600x450.jpg', thumb) if thumb else ''

        date = ''
        if ts:
            try:
                date = datetime.datetime.fromtimestamp(ts).strftime('%b %d, %Y')
            except Exception:
                pass

        results.append({'title': title, 'url': link, 'image': image, 'price': price, 'date': date})

    return results[:24]

# ── DuckDuckGo deals ────────────────────────────────────────────────────────

def fetch_deals():
    url = 'https://html.duckduckgo.com/html/?q=' + urllib.parse.quote(DEALS_QUERY) + '&kl=us-en'
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')
    blocks = re.split(r'<div class="result ', html)[1:]
    deals  = []
    for block in blocks[:12]:
        title_m = re.search(r'class="result__a"[^>]*>(.+?)</a>', block)
        url_m   = re.search(r'uddg=([^&"]+)', block)
        snip_m  = re.search(r'class="result__snippet"[^>]*>(.+?)</span>', block)
        if not title_m or not url_m:
            continue
        title = unescape(re.sub(r'<[^>]+>', '', title_m.group(1)))
        href  = urllib.parse.unquote(url_m.group(1))
        snip  = unescape(re.sub(r'<[^>]+>', '', snip_m.group(1))) if snip_m else ''
        deals.append({'title': title, 'url': href, 'snippet': snip})
    return deals

# ── HTTP handler ────────────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        qs     = urllib.parse.parse_qs(parsed.query)

        if parsed.path == '/findit':
            q = qs.get('q', [''])[0].strip()
            try:
                data = fetch_findit(q)
            except Exception as e:
                print('[findit error]', e)
                data = []
        else:
            try:
                data = fetch_deals()
            except Exception as e:
                print('[deals error]', e)
                data = []

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def log_message(self, *args):
        pass

if __name__ == '__main__':
    server = HTTPServer(('localhost', 7779), Handler)
    print('[deals-proxy] listening on http://localhost:7779')
    server.serve_forever()
