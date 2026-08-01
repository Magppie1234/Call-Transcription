---
name: ask-before-changing-llm-model
description: Never switch the LLM model used for call summarization without asking the user first
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 1d4aa1a3-d40a-47c8-8b4f-b4665a6a51ca
  modified: 2026-07-30T09:02:06.987Z
---

Always ask before changing which LLM model runs the call summarization — including
"just to compare" test runs on a different model.

**Why:** The model choice is the user's cost decision, not a technical detail. They
said plainly: "if you change models you always have to ask me." I had run
`gpt-4.1-mini` on 3 calls to build a nano-vs-mini comparison without asking, which
also overwrote those rows in Supabase.

**How to apply:** Present model options with measured cost and quality evidence, then
wait. Note that per-token price is not the real cost — a weaker model can fail schema
validation and burn more tokens through the retry loop than a stronger one (nano used
2x mini's input tokens on the same 3 calls). Before any bulk re-summarization, back up
the existing `call_summaries` rows so a bad run is reversible.

Related: [[never-paste-api-keys-in-chat]]
