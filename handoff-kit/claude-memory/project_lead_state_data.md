---
name: project-lead-state-data
description: "Caller region data — where it lives in Zoho, how it's backfilled to Supabase, and its coverage limits"
metadata: 
  node_type: memory
  type: project
  originSessionId: ffa01011-c7c1-42fa-a9bc-fc74aa2499d3
  modified: 2026-07-30T20:18:56.183Z
---

DONE (2026-07-31) — the regional bucketing task was implemented. Caller state/city comes from the Zoho Leads module (`State1`/`City`; Contacts use `Mailing_State1`/`Mailing_City`), joined via the Call's `Who_Id`/`What_Id`, and is stored on Supabase `transcripts.state/city` by `scripts/backfill_call_states.py`.

Coverage reality: 598/723 calls have a `city`; `state` is mostly null (only ~22) — **city is the reliable field, not state**. Leads from Meta Ads / IVR often have no location ("Other").

The FAQ analysis (built by `scripts/extract_faqs.py` + `scripts/aggregate_faqs.py`, published to `app_kv` key `faq_analysis`, served at `/api/faqs`, page `/faqs`) buckets cities into regions (Bengaluru, Delhi NCR, Hyderabad, Mumbai, Gujarat, …) via `CITY_REGION` in aggregate_faqs.py; ~30% of questions still land in Unknown because the linked lead has no city on file.
