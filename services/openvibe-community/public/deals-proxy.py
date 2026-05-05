#!/usr/bin/env python3
"""Tiny proxy: fetches DuckDuckGo HTML and returns parsed deals as JSON."""
import json
import re
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

DDG_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36'
QUERY  = 'fast food deals sales coupons Killeen TX'

HTML_ENTITIES = {'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'"}

def unescape(s):
    for k, v in HTML_ENTITIES.items():
        s = s.replace(k, v)
    return s.strip()

def fetch_deals():
    url = 'https://html.duckduckgo.com/html/?q=' + urllib.parse.quote(QUERY) + '&kl=us-en'
    req = urllib.request.Request(url, headers={'User-Agent': DDG_UA})
    html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')

    # Split into per-result blocks
    blocks = re.split(r'<div class="result ', html)[1:]
    deals = []
    for block in blocks[:12]:
        title_m  = re.search(r'class="result__a"[^>]*>(.+?)</a>', block)
        url_m    = re.search(r'uddg=([^&"]+)', block)
        snip_m   = re.search(r'class="result__snippet"[^>]*>(.+?)</span>', block)
        if not title_m or not url_m:
            continue
        title = unescape(re.sub(r'<[^>]+>', '', title_m.group(1)))
        href  = urllib.parse.unquote(url_m.group(1))
        snip  = unescape(re.sub(r'<[^>]+>', '', snip_m.group(1))) if snip_m else ''
        deals.append({'title': title, 'url': href, 'snippet': snip})
    return deals

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        try:
            deals = fetch_deals()
        except Exception:
            deals = []
        self.wfile.write(json.dumps(deals).encode())

    def log_message(self, *args):
        pass

if __name__ == '__main__':
    server = HTTPServer(('localhost', 7779), Handler)
    print('[deals-proxy] listening on http://localhost:7779')
    server.serve_forever()
