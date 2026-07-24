#!/usr/bin/env python3
"""
clean_names.py — Deterministic proper-noun cleanup for saved transcripts.

Free, no API. Normalises known company/product name mishears to their correct
spelling in both the full `transcript` string and every diarized entry.

Usage:
    python scripts/clean_names.py                # fix every transcript in out/transcripts
    python scripts/clean_names.py --dry-run      # report changes, write nothing
    python scripts/clean_names.py --ids id1,id2  # only these calls

Add new corrections to CORRECTIONS below: each entry maps a correct spelling to
a list of regex alternatives (matched case-insensitively, on word boundaries).
Re-running is safe — the correct spelling is excluded from its own match set.
"""
import re, json, argparse
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
TDIR = BASE / "out" / "transcripts"

# correct spelling -> variants it gets mistranscribed as
CORRECTIONS = {
    "Magppie": ["magpie", "magpies", "mac ?pie", "magpai", "magpy", "magpant",
                "magpay", "appy", "appie", "mag pie", "magpi"],
}

def build_patterns():
    compiled = []
    for correct, variants in CORRECTIONS.items():
        # don't rematch the already-correct spelling
        alts = [v for v in variants if v.lower() != correct.lower()]
        pat = re.compile(r"\b(?:" + "|".join(alts) + r")\b", re.IGNORECASE)
        compiled.append((correct, pat))
    return compiled

def fix_text(text, patterns):
    if not text:
        return text, 0
    n = 0
    for correct, pat in patterns:
        text, c = pat.subn(correct, text)
        n += c
    return text, n

def process_file(path, patterns, dry_run):
    d = json.loads(path.read_text())
    total = 0
    d["transcript"], c = fix_text(d.get("transcript", ""), patterns)
    total += c
    for e in d.get("diarized_transcript", {}).get("entries", []):
        e["transcript"], c = fix_text(e.get("transcript", ""), patterns)
        total += c
    if total and not dry_run:
        path.write_text(json.dumps(d, ensure_ascii=False, indent=2))
    return total

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--ids", type=str, default="")
    args = ap.parse_args()

    patterns = build_patterns()
    ids = set(filter(None, args.ids.split(",")))
    files = sorted(TDIR.glob("*.json"))
    if ids:
        files = [f for f in files if f.stem.replace(".mp3", "") in ids]

    changed_files, total_fixes = 0, 0
    for f in files:
        n = process_file(f, patterns, args.dry_run)
        if n:
            changed_files += 1
            total_fixes += n
    verb = "would fix" if args.dry_run else "fixed"
    print(f"{'[dry-run] ' if args.dry_run else ''}{verb} {total_fixes} name(s) "
          f"across {changed_files}/{len(files)} transcripts")

if __name__ == "__main__":
    main()
