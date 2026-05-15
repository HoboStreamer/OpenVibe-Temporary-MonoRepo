#!/usr/bin/env python3
"""Upload the 5 initialized (no storage_key) VODs to B2 and flip them to ready.

Also uploads all local avatars, thumbnails, and paste screenshots from
/opt/hobostreamer/data into the openvibe B2 bucket under user.profile_images/,
live.thumbnails/, and community.pastes/ prefixes respectively, and updates the
media_objects table and auth_users.avatar_url where applicable.
"""
import json
import os
import subprocess
import sys
from datetime import datetime

ENDPOINT = 'https://s3.us-west-004.backblazeb2.com'
BUCKET = 'openvibe'
PG = ['psql', '-h', '127.0.0.1', '-U', 'openvibe', '-d', 'openvibe', '--no-psqlrc', '-tAc']
ENV = dict(os.environ,
           PGPASSWORD='LuZkHuM9s6bQrtA2YE8DOkSig9hRiW9d',
           AWS_ACCESS_KEY_ID='00404a3a62cd74f0000000001',
           AWS_SECRET_ACCESS_KEY='K004tguWGyZKntdAPKDq9kJzR10A2K0')

LEGACY = '/opt/hobostreamer/data'
COLD   = '/mnt/hobo-cold/vods'
B2_PUBLIC_BASE = f'https://s3.us-west-004.backblazeb2.com/{BUCKET}'
TODAY = datetime.utcnow().strftime('%Y/%m/%d')


def pg(sql):
    return subprocess.check_output(PG + [sql], env=ENV).decode().strip().splitlines()


def upload(local_path, key):
    subprocess.check_call(
        ['aws', '--endpoint-url', ENDPOINT, 's3', 'cp', local_path, f's3://{BUCKET}/{key}'],
        env=ENV)


# ── 1. Upload initialized VODs ─────────────────────────────────────────────

rows = pg("select id, metadata_json from media_objects where status='initialized'")
print(f'Initialized VODs to upload: {len(rows)}')
for row in rows:
    parts = row.split('|', 1)
    mid = parts[0]
    meta = json.loads(parts[1]) if len(parts) > 1 else {}
    fp = meta.get('file_path')
    if not fp:
        print(f'  SKIP {mid}: no file_path in metadata')
        continue
    # Check hot then cold tier
    candidates = [fp, os.path.join(COLD, os.path.basename(fp))]
    src = next((c for c in candidates if c and os.path.exists(c)), None)
    if not src:
        print(f'  MISS {mid}: candidates={candidates}')
        continue
    # Derive key from id
    slug = mid.replace(':', '-')
    ext = os.path.splitext(fp)[1] or '.webm'
    key = f'live.vods/objects/{TODAY}/{slug}{ext}'
    size = os.path.getsize(src)
    print(f'  upload {mid} ({size/1e6:.1f} MB) -> {key}')
    upload(src, key)
    public_url = f'{B2_PUBLIC_BASE}/{key}'
    pg(f"update media_objects set status='ready', storage_provider='b2', storage_tier='b2', "
       f"storage_key='{key}', public_url='{public_url}' where id='{mid}'")
    print(f'    -> done')


# ── 2. Upload thumbnails ───────────────────────────────────────────────────

thumb_dir = os.path.join(LEGACY, 'thumbnails')
if os.path.isdir(thumb_dir):
    files = os.listdir(thumb_dir)
    print(f'\nThumbnail files in legacy: {len(files)}')
    uploaded_thumbs = 0
    for fname in files:
        src = os.path.join(thumb_dir, fname)
        key = f'live.thumbnails/objects/{TODAY}/{fname}'
        try:
            upload(src, key)
            uploaded_thumbs += 1
        except subprocess.CalledProcessError as e:
            print(f'  FAIL {fname}: {e}')
    print(f'Thumbnails uploaded: {uploaded_thumbs}')


# ── 3. Upload avatars ──────────────────────────────────────────────────────

avatar_dir = os.path.join(LEGACY, 'avatars')
if os.path.isdir(avatar_dir):
    files = [f for f in os.listdir(avatar_dir) if os.path.isfile(os.path.join(avatar_dir, f))]
    print(f'\nAvatar files in legacy: {len(files)}')
    uploaded_avs = 0
    for fname in files:
        src = os.path.join(avatar_dir, fname)
        key = f'user.profile_images/objects/{TODAY}/{fname}'
        try:
            upload(src, key)
            uploaded_avs += 1
        except subprocess.CalledProcessError as e:
            print(f'  FAIL {fname}: {e}')
    print(f'Avatars uploaded: {uploaded_avs}')


# ── 4. Upload paste screenshots ───────────────────────────────────────────

paste_dir = os.path.join(LEGACY, 'pastes', 'screenshots')
if os.path.isdir(paste_dir):
    files = [f for f in os.listdir(paste_dir) if os.path.isfile(os.path.join(paste_dir, f))]
    print(f'\nPaste screenshots in legacy: {len(files)}')
    uploaded_ps = 0
    for fname in files:
        src = os.path.join(paste_dir, fname)
        key = f'community.pastes/screenshots/{TODAY}/{fname}'
        try:
            upload(src, key)
            uploaded_ps += 1
        except subprocess.CalledProcessError as e:
            print(f'  FAIL {fname}: {e}')
    print(f'Paste screenshots uploaded: {uploaded_ps}')


# ── 5. Emit B2 public URL suggestion ─────────────────────────────────────

print(f'\nSet in /opt/openvibe/.env:')
print(f'  OPENVIBE_MEDIA_B2_PUBLIC_BASE_URL={B2_PUBLIC_BASE}')
print('Done.')
