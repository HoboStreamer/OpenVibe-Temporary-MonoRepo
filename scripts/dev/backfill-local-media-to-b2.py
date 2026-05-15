#!/usr/bin/env python3
"""Backfill media bytes for media_objects rows still pointing at local storage.

Reads the migration bundle's media/objects.ndjson to find legacy file paths,
uploads them to the OpenVibe B2 bucket using the same key the DB row already
has, then flips storage_provider/storage_tier to 'b2'.
"""
import json
import os
import subprocess
import sys

BUNDLE = '/opt/openvibe/data/migrations/hobo-production-final-20260501/openvibe-target/media/objects.ndjson'
ENDPOINT = 'https://s3.us-west-004.backblazeb2.com'
BUCKET = 'openvibe'
PG = ['psql', '-h', '127.0.0.1', '-U', 'openvibe', '-d', 'openvibe', '--no-psqlrc', '-tAc']
ENV = dict(os.environ, PGPASSWORD='LuZkHuM9s6bQrtA2YE8DOkSig9hRiW9d',
           AWS_ACCESS_KEY_ID='00404a3a62cd74f0000000001',
           AWS_SECRET_ACCESS_KEY='K004tguWGyZKntdAPKDq9kJzR10A2K0')


def pg(sql):
    return subprocess.check_output(PG + [sql], env=ENV).decode().strip().splitlines()


def upload(local_path, key):
    cmd = ['aws', '--endpoint-url', ENDPOINT, 's3', 'cp', local_path, f's3://{BUCKET}/{key}']
    subprocess.check_call(cmd, env=ENV)


def main():
    rows = pg("select id||'|'||storage_key from media_objects where storage_provider='local'")
    locals_map = {}
    for line in rows:
        if not line:
            continue
        mid, key = line.split('|', 1)
        locals_map[mid] = key
    print(f'local-only count: {len(locals_map)}')

    paths = {}
    cold_root = '/mnt/hobo-cold/vods'
    with open(BUNDLE) as f:
        for line in f:
            obj = json.loads(line)
            if obj['id'] in locals_map:
                paths[obj['id']] = obj.get('file_path')

    uploaded = []
    missing = []
    for mid, key in locals_map.items():
        candidates = []
        p = paths.get(mid)
        if p:
            candidates.append(p)
            base = os.path.basename(p)
            candidates.append(os.path.join(cold_root, base))
        chosen = next((c for c in candidates if c and os.path.exists(c)), None)
        if not chosen:
            missing.append((mid, candidates))
            continue
        size = os.path.getsize(chosen)
        print(f'  upload {mid} <- {chosen} ({size/1e6:.1f} MB) -> s3://{BUCKET}/{key}')
        try:
            upload(chosen, key)
            uploaded.append(mid)
        except subprocess.CalledProcessError as e:
            print(f'    UPLOAD FAILED: {e}')
            missing.append((mid, [chosen]))

    print(f'uploaded: {len(uploaded)} missing: {len(missing)}')
    if uploaded:
        ids = ','.join(f"'{i}'" for i in uploaded)
        n = pg(f"with u as (update media_objects set storage_provider='b2', storage_tier='b2' where id in ({ids}) returning 1) select count(*) from u")
        print(f'flipped {n[0]} rows to b2')
    for mid, cands in missing:
        print(f'  MISS {mid} candidates={cands}')


if __name__ == '__main__':
    main()
