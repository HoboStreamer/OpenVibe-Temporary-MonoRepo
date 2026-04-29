#!/usr/bin/env python3
import json
import sys

payload = json.loads(sys.stdin.read() or '{}')
media_id = str(payload.get('media_id') or 'unknown-media')
duration_ms = int(payload.get('duration_ms') or 120000)
window = max(5000, duration_ms // 6)
markers = [
    {
        'start_ms': 0,
        'end_ms': window,
        'score': 0.22,
        'source': 'local-stub',
        'label': f'{media_id}-opening-motion'
    },
    {
        'start_ms': window * 2,
        'end_ms': min(duration_ms, window * 3),
        'score': 0.41,
        'source': 'local-stub',
        'label': f'{media_id}-mid-motion'
    },
]
json.dump({'ok': True, 'mode': 'local-stub', 'markers': markers}, sys.stdout)
