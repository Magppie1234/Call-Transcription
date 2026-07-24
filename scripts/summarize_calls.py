#!/usr/bin/env python3
"""
summarize_calls.py — Generate a structured conversation summary + metrics for
each transcribed call, using Claude.

- Reads transcripts from out/transcripts/{id}.mp3.json
- Pulls the REAL agent/customer names from Zoho CRM (never invented)
- Computes talk-ratio and turn count for free from the diarization
- Sends the transcript to Claude with a strict JSON schema; the model is told
  to use ONLY the transcript and the CRM-provided names, and to NEVER invent a
  name — anything not in the data comes back null / "unknown"
- Saves out/summaries/{id}.json

Usage:
    python scripts/summarize_calls.py --limit 5        # prototype on 5 calls
    python scripts/summarize_calls.py --ids id1,id2
    python scripts/summarize_calls.py                  # all transcribed, unsummarized

Requires ANTHROPIC_API_KEY in .env (get one at console.anthropic.com).
Model is configurable via SUMMARY_MODEL env (default claude-haiku-4-5).
"""
import os, re, sys, json, time, argparse, requests
from pathlib import Path
from typing import Optional, List, Literal
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

BASE  = Path(__file__).resolve().parent.parent
TDIR  = BASE / "out" / "transcripts"
SDIR  = BASE / "out" / "summaries"
SDIR.mkdir(parents=True, exist_ok=True)

ZOHO_API    = os.getenv("ZOHO_API_DOMAIN", "https://www.zohoapis.in")
ZOHO_ACC    = os.getenv("ZOHO_ACCOUNTS_DOMAIN", "https://accounts.zoho.in")
TOKEN_CACHE = BASE / ".zoho_token_cache.json"
MODEL       = os.getenv("SUMMARY_MODEL", "claude-haiku-4-5")

# ── Structured schema Claude must fill (all metrics) ───────────────────────
class Requirements(BaseModel):
    kitchen_type: Optional[str] = Field(None, description="e.g. modular, L-shaped; null if not mentioned")
    budget:       Optional[str] = Field(None, description="budget stated by customer; null if not mentioned")
    location:     Optional[str] = Field(None, description="city/area mentioned; null if not mentioned")
    timeline:     Optional[str] = Field(None, description="when they want it done; null if not mentioned")

class CallSummary(BaseModel):
    summary: str = Field(description="2-3 sentence neutral overview of the conversation")
    call_outcome: Literal[
        "interested", "not_interested", "callback_requested", "follow_up_needed",
        "not_reachable", "wrong_number", "already_purchased", "unclear",
    ]
    next_action: Optional[str] = Field(None, description="concrete follow-up, incl. date if stated; null if none")
    customer_sentiment: Literal["positive", "neutral", "negative"]
    interest_level: Literal["hot", "warm", "cold", "unknown"]
    agent_politeness: int = Field(description="1 (rude) to 5 (very polite)")
    agent_professionalism: int = Field(description="1 (poor) to 5 (excellent): greeting, self-intro, clear close")
    professionalism_notes: Optional[str] = Field(None, description="brief note on agent conduct")
    customer_requirements: Requirements
    objections: List[str] = Field(default_factory=list, description="objections the customer raised")
    action_items: List[str] = Field(default_factory=list, description="things the agent should do next")
    red_flags: List[str] = Field(default_factory=list, description="rudeness, complaints, escalation; empty if none")
    language: str = Field(description="language(s) used, e.g. 'Hindi/English', 'Telugu'")

SYSTEM = (
    "You analyse call-centre transcripts for Magppie, a modular-kitchen company that "
    "makes outbound sales calls. You will be given the diarized transcript of ONE call, "
    "plus the REAL agent and customer names from the CRM.\n\n"
    "STRICT RULES:\n"
    "1. Base every field ONLY on the transcript content provided. Do not use outside knowledge.\n"
    "2. NEVER invent or guess a person's name. The agent and customer identities are given to "
    "you from the CRM — do not replace or 'correct' them. If a name is not present in the data, "
    "leave the relevant field null or say 'unknown'. Do not fabricate.\n"
    "3. The transcript is machine-generated (Hindi/English/Telugu, romanised) and may contain "
    "errors — interpret charitably but do not invent facts that aren't there.\n"
    "4. If the call has no real conversation (voicemail, immediate hang-up, no answer), reflect "
    "that honestly in the outcome and summary."
)

# ── Zoho auth + metadata (real names) ──────────────────────────────────────
def get_token():
    try:
        c = json.loads(TOKEN_CACHE.read_text())
        if c.get("token") and c.get("expiresAt", 0) > time.time() * 1000 + 120_000:
            return c["token"]
    except Exception:
        pass
    r = requests.post(f"{ZOHO_ACC}/oauth/v2/token", data={
        "refresh_token": os.getenv("ZOHO_REFRESH_TOKEN"),
        "client_id":     os.getenv("ZOHO_CLIENT_ID"),
        "client_secret": os.getenv("ZOHO_CLIENT_SECRET"),
        "grant_type":    "refresh_token",
    }, timeout=30)
    d = r.json()
    if not d.get("access_token"):
        print("❌ Zoho token failed:", d); sys.exit(1)
    TOKEN_CACHE.write_text(json.dumps({
        "token": d["access_token"],
        "expiresAt": int(time.time() * 1000) + int(d.get("expires_in", 3600)) * 1000,
    }))
    return d["access_token"]

def fetch_meta(token, call_id):
    """Fetch the CRM-verified agent/customer names for one call. Never fabricated."""
    fields = "id,Subject,Owner,Who_Id,What_Id,Call_Type,Call_Duration_in_seconds,Call_Start_Time"
    r = requests.get(f"{ZOHO_API}/crm/v7/Calls/{call_id}",
                     params={"fields": fields},
                     headers={"Authorization": f"Zoho-oauthtoken {token}"}, timeout=30)
    if not r.ok:
        return None
    rec = (r.json().get("data") or [{}])[0]
    cust = rec.get("What_Id") or rec.get("Who_Id") or {}
    return {
        "agent":    (rec.get("Owner") or {}).get("name") or "Unknown Agent",
        "customer": cust.get("name") or "Unknown",
        "call_type": rec.get("Call_Type") or "",
        "duration_seconds": int(rec.get("Call_Duration_in_seconds") or 0),
        "start_time": rec.get("Call_Start_Time"),
    }

# ── Transcript helpers ─────────────────────────────────────────────────────
COMPANY_RE = re.compile(r"\bmag+p+ie|magpp?ie|mac ?pie|magpai|magpy\b", re.I)

def agent_speaker_id(entries):
    """Same heuristic as the dashboard: the speaker who names the company is the agent."""
    if not entries:
        return None
    brand = next((e for e in entries if COMPANY_RE.search(e.get("transcript", "") or "")), None)
    if brand:
        return brand.get("speaker_id")
    longe = next((e for e in entries if len((e.get("transcript") or "").strip()) > 20), None)
    if longe:
        return longe.get("speaker_id")
    counts = {}
    for e in entries:
        counts[e.get("speaker_id")] = counts.get(e.get("speaker_id"), 0) + 1
    return max(counts, key=counts.get) if counts else None

def talk_ratio(entries, agent_sid):
    """Free metric from diarization: share of spoken characters per side."""
    ac = cc = 0
    for e in entries:
        n = len((e.get("transcript") or "").strip())
        if e.get("speaker_id") == agent_sid:
            ac += n
        else:
            cc += n
    total = ac + cc
    if not total:
        return None, None
    return round(100 * ac / total), round(100 * cc / total)

def render_transcript(entries, agent_sid, agent_name, customer_name):
    lines = []
    for e in entries:
        who = agent_name if e.get("speaker_id") == agent_sid else customer_name
        t = (e.get("transcript") or "").strip()
        if t:
            lines.append(f"{who}: {t}")
    return "\n".join(lines)

# ── Claude call ────────────────────────────────────────────────────────────
def summarize(client, meta, transcript_text):
    user = (
        f"CRM-verified names (use these exactly, do not change or invent):\n"
        f"- Agent (Magppie): {meta['agent']}\n"
        f"- Customer: {meta['customer']}\n"
        f"- Call type: {meta['call_type']}\n\n"
        f"Transcript:\n{transcript_text if transcript_text.strip() else '(no speech detected)'}"
    )
    resp = client.messages.parse(
        model=MODEL,
        max_tokens=1500,
        system=SYSTEM,
        messages=[{"role": "user", "content": user}],
        output_format=CallSummary,
    )
    return resp.parsed_output

# ── Main ───────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", default="", help="comma-separated call IDs")
    ap.add_argument("--limit", type=int, default=0, help="cap this run (0 = no cap)")
    args = ap.parse_args()

    if not os.getenv("ANTHROPIC_API_KEY"):
        print("❌ Missing ANTHROPIC_API_KEY in .env — get one at console.anthropic.com")
        sys.exit(1)
    import anthropic
    client = anthropic.Anthropic()

    done = {f.stem for f in SDIR.glob("*.json")}
    ids = list(filter(None, args.ids.split(",")))
    if not ids:
        ids = [f.stem.replace(".mp3", "") for f in sorted(TDIR.glob("*.json"))
               if f.stem.replace(".mp3", "") not in done]
    if args.limit:
        ids = ids[:args.limit]
    if not ids:
        print("🎉 Nothing to summarize."); return

    print(f"🧠 Summarizing {len(ids)} call(s) with {MODEL}\n")
    token = get_token()
    saved = 0
    for i, cid in enumerate(ids, 1):
        tpath = TDIR / f"{cid}.mp3.json"
        if not tpath.exists():
            print(f"  ⚠ [{i}] no transcript for {cid}"); continue
        data = json.loads(tpath.read_text())
        entries = data.get("diarized_transcript", {}).get("entries", [])

        meta = fetch_meta(token, cid)
        if meta is None:
            print(f"  ⚠ [{i}] could not fetch CRM meta for {cid}, skipping"); continue

        agent_sid = agent_speaker_id(entries)
        a_pct, c_pct = talk_ratio(entries, agent_sid)
        transcript_text = render_transcript(entries, agent_sid, meta["agent"], meta["customer"])

        try:
            result = summarize(client, meta, transcript_text)
        except Exception as e:
            print(f"  ❌ [{i}] {cid}: {e}"); continue

        out = {
            "call_id": cid,
            "model": MODEL,
            # identity + free metrics are NOT from the model — they are ground truth
            "agent": meta["agent"],
            "customer": meta["customer"],
            "call_type": meta["call_type"],
            "duration_seconds": meta["duration_seconds"],
            "talk_ratio": {"agent_pct": a_pct, "customer_pct": c_pct},
            "num_turns": len(entries),
            "analysis": result.model_dump(),
        }
        (SDIR / f"{cid}.json").write_text(json.dumps(out, ensure_ascii=False, indent=2))
        saved += 1
        print(f"  ✅ [{i}] {meta['agent']} → {meta['customer']}: "
              f"{result.call_outcome} / {result.customer_sentiment} / polite {result.agent_politeness}/5")

    print(f"\n✅ Saved {saved} summaries to out/summaries/")

if __name__ == "__main__":
    main()
