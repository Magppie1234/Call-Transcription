---
name: never-paste-api-keys-in-chat
description: API keys go directly into .env by the user; never accept or echo a key in chat
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 1d4aa1a3-d40a-47c8-8b4f-b4665a6a51ca
  modified: 2026-07-30T09:02:16.955Z
---

Never accept an API key pasted into the conversation, and never print a key value.
The user pastes it into `.env` themselves and says "done"; verification is by
presence, length and prefix only (e.g. `len(k)`, `k[:8]`).

**Why:** Anything in the chat transcript is stored and may be replayed. The user has
offered keys in chat more than once across sessions and it was declined each time.

**How to apply:** Append an empty `KEY_NAME=` placeholder to `.env`, tell the user
which file and line, and have them save it. `.env` and `dashboard/.env.local` are
gitignored; `.env.example` is committed and must only ever hold empty placeholders —
a real key in it once tripped GitHub push protection. Scan every diff for
secret-shaped strings before committing.

Related: [[ask-before-changing-llm-model]], [[transcripts-contain-customer-pii]]
