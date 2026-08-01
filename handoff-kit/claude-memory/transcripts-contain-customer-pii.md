---
name: transcripts-contain-customer-pii
description: Call transcripts hold real customer names (all 723) and must never be committed or sent to vendors casually
metadata: 
  node_type: memory
  type: project
  originSessionId: 1d4aa1a3-d40a-47c8-8b4f-b4665a6a51ca
  modified: 2026-07-30T09:02:28.134Z
---

The 723 transcripts in `out/transcripts/` contain real Magppie customer data. Never
commit them to git, and treat sending them to any new vendor as a decision for the
user rather than an implementation detail.

Measured as of 2026-07-30: a real customer name goes out on **all 723** calls (the
summarizer injects it deliberately from Zoho CRM so the model cannot invent one).
Beyond names — 3 transcripts contain a phone number in digits, 5 a spoken digit
sequence, 4 an address term ("sector", "plot no"), 0 emails.

**Why:** Magppie is Indian, so India's DPDP Act notice-and-consent obligations apply
to handing this to a processor abroad. Whether existing call-recording consent covers
"transcript sent to a US AI vendor" is Magppie's call, not something to assume.

**How to apply:** Vendors in the chain so far — Sarvam (audio, more identifying than
text) and OpenAI (transcript text). Flag any addition. If the user wants the exposure
reduced, the customer name can be stripped from the LLM payload and joined back from
Supabase for display; the model only needs it to write the name into the summary.

Related: [[never-paste-api-keys-in-chat]]
