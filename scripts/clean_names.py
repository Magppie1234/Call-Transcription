#!/usr/bin/env python3
"""
clean_names.py — Deterministic proper-noun cleanup for transcripts and summaries.

Free, no API. Normalises the many ways Sarvam mishears "Magppie" back to the
correct spelling, everywhere the name can appear:

  - local transcripts  (out/transcripts/*.mp3.json)
  - Supabase `transcripts`     (the copy the dashboard reads)
  - Supabase `call_summaries`  (summary, next_action, notes, objections, ...)

Usage:
    python scripts/clean_names.py                # fix everything, everywhere
    python scripts/clean_names.py --dry-run      # report changes, write nothing
    python scripts/clean_names.py --local-only   # skip Supabase
    python scripts/clean_names.py --ids id1,id2  # only these calls (local)

Re-running is safe — the correct spelling never matches its own variant set.

Two mechanisms:
  1. VARIANTS below — an explicit list, every form actually observed in the
     real call data. Explicit beats clever: a loose "sounds like Magppie"
     regex also eats legitimate words these calls are full of, e.g. marble
     (a real kitchen material), matlab, maybe, and Hindi phrases like
     "mein bhi" / "main baat".
  2. A contextual rule: any single token sitting immediately before
     "Wellness Kitchen" / "Wellness Home" is the company name by definition,
     so unknown future mishears get caught there too.
"""
import os, re, json, argparse
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
TDIR = BASE / "out" / "transcripts"

CORRECT = "Magppie"

# Every mishearing observed in the real transcripts. Matched case-insensitively
# on word boundaries. Keep additions here rather than loosening the regex.
VARIANTS = [
    # magp-
    "magpie", "magpies", "magpai", "magpy", "magpi", "magpant", "magpay",
    "mag ?pie", "magpike",
    # mac-/mak-
    "mac ?pie", "macpay", "macpy", "macpai", "macpike", "macprice", "mac ?by",
    "mac ?5", "mach ?pie", "mak ?pai", "maak ?paai",
    # map-
    "mapify", "mapai", "mapbuy", "mapby", "map ?by", "mapfire", "madpais",
    # mat-/matt-
    "matpai", "matpay", "matrai", "mat ?pie", "mat ?by", "matt ?pie",
    "matt ?by", "matt ?five", "matt ?fire",
    # max-
    "max ?pay", "max ?buy", "max ?by", "max ?pie", "max ?five", "maxpay",
    "maxify", "maxi",
    # mad-/med-/misc
    "mad ?pie", "mad ?bhai", "medby", "med ?by", "math ?by", "path ?by",
    "back ?five", "nagpay", "myspy", "madhapai", "nhp ?pie", "magi ?pay",
    # legacy short forms
    "appy", "appie",
]

# "Madurai" is a real Tamil Nadu city, so it can't go in the list above — a
# customer saying "my site is in Madurai" must survive untouched (it also feeds
# the `location` field in summaries). Every observed case is an agent
# self-introducing, so only correct it in that exact position.
SCOPED = [
    (re.compile(r"(?<=calling from )madurai\b", re.IGNORECASE), CORRECT),
]

# An unknown token right before "Wellness Kitchen/Home" is likely the company
# name — but only trust it when the token is phonetically Magppie-shaped
# (starts m/n, contains a p/b/f/v/x sound). Without that guard this eats the
# generic usages these calls are full of: "a wellness kitchen", "stone kitchen
# sir wellness kitchen".
CONTEXT_RE = re.compile(
    r"\b(?!Magppie\b)[MmNn][A-Za-z']*[PpBbFfVvXx][A-Za-z']*"
    r"(?=\s+Wellness\s+(?:Kitchen|Home)\b)",
)

def build_pattern():
    alts = [v for v in VARIANTS if v.lower() != CORRECT.lower()]
    return re.compile(r"\b(?:" + "|".join(alts) + r")\b", re.IGNORECASE)

VARIANT_RE = build_pattern()

def fix_text(text):
    """Returns (fixed_text, n_changes). Safe on None/empty."""
    if not text:
        return text, 0
    total = 0
    text, n = VARIANT_RE.subn(CORRECT, text); total += n
    for pat, repl in SCOPED:
        text, n = pat.subn(repl, text); total += n
    text, n = CONTEXT_RE.subn(CORRECT, text); total += n
    return text, total

def fix_list(items):
    if not items:
        return items, 0
    out, total = [], 0
    for s in items:
        s2, n = fix_text(s)
        out.append(s2); total += n
    return out, total

# ── Local transcript files ─────────────────────────────────────────────────
def process_local(dry_run, ids):
    files = sorted(TDIR.glob("*.json"))
    if ids:
        files = [f for f in files if f.name.removesuffix(".mp3.json") in ids]
    changed_files = total = 0
    for path in files:
        d = json.loads(path.read_text())
        n = 0
        d["transcript"], c = fix_text(d.get("transcript", "")); n += c
        for e in d.get("diarized_transcript", {}).get("entries", []):
            e["transcript"], c = fix_text(e.get("transcript", "")); n += c
        if n:
            changed_files += 1; total += n
            if not dry_run:
                path.write_text(json.dumps(d, ensure_ascii=False, indent=2))
    return total, changed_files, len(files)

# ── Supabase ───────────────────────────────────────────────────────────────
def sb_config():
    from dotenv import load_dotenv
    load_dotenv()
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return None
    return url, {
        "apikey": key, "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

def sb_fetch_all(url, headers, table, select):
    """Paginated — PostgREST caps at 1000 rows per request."""
    import requests
    rows, offset, page = [], 0, 1000
    while True:
        h = dict(headers); h["Range"] = f"{offset}-{offset + page - 1}"
        r = requests.get(f"{url}/rest/v1/{table}", headers=h,
                         params={"select": select}, timeout=60)
        r.raise_for_status()
        batch = r.json()
        rows += batch
        if len(batch) < page:
            return rows
        offset += page

def sb_upsert(url, headers, table, rows):
    import requests
    h = dict(headers); h["Prefer"] = "resolution=merge-duplicates,return=minimal"
    for i in range(0, len(rows), 100):
        r = requests.post(f"{url}/rest/v1/{table}", headers=h,
                          data=json.dumps(rows[i:i + 100]), timeout=60)
        r.raise_for_status()

def process_supabase_transcripts(url, headers, dry_run):
    rows = sb_fetch_all(url, headers, "transcripts", "call_id,transcript")
    updates, total = [], 0
    for row in rows:
        d, n = row["transcript"], 0
        d["transcript"], c = fix_text(d.get("transcript", "")); n += c
        for e in d.get("diarized_transcript", {}).get("entries", []):
            e["transcript"], c = fix_text(e.get("transcript", "")); n += c
        if n:
            total += n
            updates.append({"call_id": row["call_id"], "transcript": d})
    if updates and not dry_run:
        sb_upsert(url, headers, "transcripts", updates)
    return total, len(updates), len(rows)

SUMMARY_TEXT_FIELDS = ["summary", "next_action", "professionalism_notes",
                       "kitchen_type", "location", "timeline"]
SUMMARY_LIST_FIELDS = ["objections", "action_items", "red_flags"]

def process_supabase_summaries(url, headers, dry_run):
    cols = "call_id," + ",".join(SUMMARY_TEXT_FIELDS + SUMMARY_LIST_FIELDS)
    rows = sb_fetch_all(url, headers, "call_summaries", cols)
    updates, total = [], 0
    for row in rows:
        upd, n = {}, 0
        for f in SUMMARY_TEXT_FIELDS:
            v, c = fix_text(row.get(f))
            if c: upd[f] = v; n += c
        for f in SUMMARY_LIST_FIELDS:
            v, c = fix_list(row.get(f))
            if c: upd[f] = v; n += c
        if n:
            total += n
            updates.append({"call_id": row["call_id"], **upd})
    if updates and not dry_run:
        # PATCH per row: a partial upsert would null out unlisted NOT NULL cols.
        import requests
        h = dict(headers); h["Prefer"] = "return=minimal"
        for u in updates:
            cid = u.pop("call_id")
            r = requests.patch(f"{url}/rest/v1/call_summaries", headers=h,
                               params={"call_id": f"eq.{cid}"},
                               data=json.dumps(u), timeout=30)
            r.raise_for_status()
    return total, len(updates), len(rows)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--local-only", action="store_true", help="skip Supabase")
    ap.add_argument("--ids", type=str, default="", help="only these call ids (local files)")
    args = ap.parse_args()

    ids = set(filter(None, args.ids.split(",")))
    tag = "[dry-run] " if args.dry_run else ""
    verb = "would fix" if args.dry_run else "fixed"

    n, changed, seen = process_local(args.dry_run, ids)
    print(f"{tag}local transcripts:    {verb} {n} name(s) across {changed}/{seen} files")

    if args.local_only:
        return
    cfg = sb_config()
    if not cfg:
        print("  (skipping Supabase — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set)")
        return
    url, headers = cfg

    n, changed, seen = process_supabase_transcripts(url, headers, args.dry_run)
    print(f"{tag}supabase transcripts: {verb} {n} name(s) across {changed}/{seen} rows")

    n, changed, seen = process_supabase_summaries(url, headers, args.dry_run)
    print(f"{tag}supabase summaries:   {verb} {n} name(s) across {changed}/{seen} rows")

if __name__ == "__main__":
    main()
