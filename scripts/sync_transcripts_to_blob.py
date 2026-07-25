#!/usr/bin/env python3
"""
sync_transcripts_to_blob.py — Upload local transcripts (out/transcripts/*.mp3.json)
to Vercel Blob so the deployed dashboard (which has no local disk) can see them.

Run this after batch_transcribe.py / clean_names.py, any time new transcripts
have been generated locally. Safe to re-run — already-uploaded transcripts are
skipped by checking Blob storage first.

There's no official Vercel Blob SDK for Python, so this talks to the same
REST API the official @vercel/blob JS SDK uses (endpoints, headers, and the
store-id-from-token parsing verified against the installed package source in
dashboard/node_modules/@vercel/blob).

Requires BLOB_READ_WRITE_TOKEN in .env (same token used by the dashboard —
copy it from the Vercel Storage tab into both dashboard/.env.local and here).
"""
import os, sys, json
from pathlib import Path
from dotenv import load_dotenv
import requests

load_dotenv()

BASE   = Path(__file__).resolve().parent.parent
TDIR   = BASE / "out" / "transcripts"
API    = "https://vercel.com/api/blob"
TOKEN  = os.getenv("BLOB_READ_WRITE_TOKEN")

def store_id_from_token(token):
    # Token shape: vercel_blob_rw_<storeId>_<secret>
    parts = token.split("_")
    return parts[3] if len(parts) > 3 else ""

def headers(extra=None):
    h = {
        "Authorization": f"Bearer {TOKEN}",
        "x-api-version": "12",
        "x-vercel-blob-store-id": store_id_from_token(TOKEN),
    }
    if extra:
        h.update(extra)
    return h

def list_uploaded():
    ids, cursor = set(), None
    while True:
        params = {"prefix": "transcripts/", "limit": 1000}
        if cursor:
            params["cursor"] = cursor
        r = requests.get(API, params=params, headers=headers(), timeout=30)
        r.raise_for_status()
        d = r.json()
        for b in d.get("blobs", []):
            name = b["pathname"].removeprefix("transcripts/").removesuffix(".mp3.json")
            ids.add(name)
        if not d.get("hasMore"):
            break
        cursor = d.get("cursor")
    return ids

def upload_one(call_id, content):
    r = requests.put(
        API,
        params={"pathname": f"transcripts/{call_id}.mp3.json"},
        headers=headers({
            "x-content-type": "application/json",
            "x-vercel-blob-access": "private",
            "x-allow-overwrite": "1",
        }),
        data=content.encode("utf-8"),
        timeout=30,
    )
    r.raise_for_status()

def main():
    if not TOKEN:
        print("❌ Missing BLOB_READ_WRITE_TOKEN in .env")
        print("   Copy it from the Vercel dashboard → Storage tab → your Blob store")
        sys.exit(1)

    local = {f.name.removesuffix(".mp3.json") for f in TDIR.glob("*.mp3.json")}
    print(f"📄 {len(local)} local transcripts")

    uploaded = list_uploaded()
    print(f"☁️  {len(uploaded)} already in Blob storage")

    todo = sorted(local - uploaded)
    if not todo:
        print("🎉 Nothing to sync — Blob storage is up to date.")
        return

    print(f"⬆️  Uploading {len(todo)} transcript(s)...")
    ok = failed = 0
    for i, call_id in enumerate(todo, 1):
        content = (TDIR / f"{call_id}.mp3.json").read_text(encoding="utf-8")
        try:
            upload_one(call_id, content)
            ok += 1
        except requests.RequestException as e:
            failed += 1
            print(f"  ❌ {call_id}: {e}")
        if i % 20 == 0 or i == len(todo):
            print(f"  {i}/{len(todo)} processed")

    print(f"\n✅ Done. Uploaded {ok}, failed {failed}.")

if __name__ == "__main__":
    main()
