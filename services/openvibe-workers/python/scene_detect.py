#!/usr/bin/env python3
import json
import sys


def main() -> int:
    payload = json.loads(sys.stdin.read() or '{}')
    result = {
        'ok': True,
        'skipped': True,
        'reason': 'PySceneDetect/OpenCV not configured in this runtime',
        'input': payload,
    }
    sys.stdout.write(json.dumps(result))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
