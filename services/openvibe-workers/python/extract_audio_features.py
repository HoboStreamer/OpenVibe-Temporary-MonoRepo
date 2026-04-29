#!/usr/bin/env python3
import json
import sys

payload = json.loads(sys.stdin.read() or '{}')
media_id = str(payload.get('media_id') or 'unknown-media')
json.dump({
    'ok': True,
    'mode': 'local-stub',
    'media_id': media_id,
    'features': {
        'peak_level_dbfs': -8.4,
        'avg_level_dbfs': -18.7,
        'tempo_bpm': 96,
        'speech_ratio': 0.63,
        'silence_ratio': 0.14,
        'spectral_centroid_hz': 1840,
    },
}, sys.stdout)
