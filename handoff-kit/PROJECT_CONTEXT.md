# Call Transcription Project — Full Context Handoff

Everything a fresh Claude Code session needs to know about this project that is
NOT visible in the code. Written 2026-07-31. The code itself lives at
https://github.com/Magppie1234/Call-Transcription (public repo) — clone it and
read PLAN.md + SETUP.md first; this document is the layer on top.

## What this is

Pipeline that transcribes Magppie's sales-call recordings (Zoho CRM ←
Ozonetel telephony) with Sarvam Saaras v3 STT, analyses them with an LLM, and
serves a Next.js dashboard (dashboard/) with per-call summaries, analytics,
caller regions, and a customer-FAQ training section. Magppie is a premium
stone modular kitchen company in India; calls are romanised Hindi/Hinglish.

## Current state (2026-07-31)

- 723 calls transcribed (July 2026 window). Transcript JSONs live in
  `out/transcripts/*.mp3.json` locally AND in the Supabase `transcripts` table
  (jsonb) — `out/` is gitignored, so a fresh clone must pull from Supabase or
  copy `out/` from the original machine (`/Users/UNICA/Desktop/call transcription`).
- 723/723 rows in `call_summaries` (gpt-4.1-mini).
- 719/723 per-call FAQ extractions in `out/faqs/*.json` (4 calls had
  empty/too-short transcripts). Aggregated FAQ analysis (255 canonical FAQs,
  29 needing clarification) published to Supabase `app_kv` key `faq_analysis`
  and mirrored at `out/faq_analysis.json`.
- 598/723 calls have a caller city on `transcripts.city` (state mostly empty —
  city is the reliable field).
- Dashboard fully works on localhost (`npm run dev` in dashboard/). It is NOT
  yet deployed anywhere — see "Unfinished business".

## Account topology (the part that bites)

- **Zoho**: India data centre — everything is `accounts.zoho.in` /
  `www.zohoapis.in`. Production CRM org id **8681355**. The OAuth app is a
  **Self Client** (Zoho allows exactly ONE per account — never try to create a
  second, reuse it and just generate new codes). Scopes in use:
  `ZohoCRM.modules.calls.READ, ZohoCRM.modules.notes.CREATE,
  ZohoCRM.modules.attachments.READ, ZohoCRM.settings.fields.READ`.
  Grant codes expire in ~3 minutes; refresh tokens never expire, and multiple
  refresh tokens can be live at once — the root `.env` and `dashboard/.env.local`
  intentionally hold DIFFERENT refresh tokens, both valid. Access tokens last
  1h, max 10 refreshes per 10 min; both Python scripts and the dashboard cache
  the token (`.zoho_token_cache.json` locally / Supabase `app_kv` in the app).
- **Supabase**: project `veqjkqpurwyfcpdkhnzz` (URL in .env). IMPORTANT: the
  claude.ai Supabase MCP connector is logged into a DIFFERENT Supabase account
  (it sees "Magppie1234's Project" and "clarity-desk-prod", NOT this project),
  so Claude has **no DDL access** — schema changes must be run by the user in
  the Supabase SQL editor (source of truth: `dashboard/supabase-schema.sql`).
  This is exactly why the FAQ analysis lives as one jsonb value in `app_kv`
  instead of proper tables.
- **Vercel**: team `magppiesilverstonepvtltd` (team_3kNUUimkx3oLM7Mfudka1f6S).
  The claude.ai Vercel connector is READ-ONLY on this team — every attempt to
  create a deployment returns 403. The existing `clarity-desk` project there is
  a DIFFERENT product (Magppie-TaskFlow repo); do not touch it. This dashboard
  has never been deployed.
- **GitHub**: repo `Magppie1234/Call-Transcription`, **public**, branch `main`,
  https auth via macOS keychain (`gh` CLI is NOT installed).
- **Ozonetel**: the telephony vendor behind Zoho PhoneBridge. Credentials were
  NEVER obtained (support ticket never filed). All audio was downloaded via
  Zoho instead — see the ZOHO_COOKIE hack below.

## Secrets & the .env files

Real values are NOT in this kit (project rule: secrets never go in chat or
zips — copy the actual files from the original project folder). Two env files:

- Root `.env` — used by the Python scripts. Has Zoho OAuth (client id/secret/
  refresh token), SARVAM_API_KEY, ZOHO_COOKIE, SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY (legacy free-tier fallback),
  OPENAI_API_KEY (current summarizer).
- `dashboard/.env.local` — used by Next.js. Same Zoho + Supabase values (its
  own refresh token), plus ZOHO_COOKIE. BLOB_READ_WRITE_TOKEN exists but is
  empty/unused.

Quirks worth knowing:
- **ZOHO_COOKIE** is a pasted browser session cookie from a logged-in Zoho CRM
  tab. It exists because Ozonetel API creds were never obtained — the
  dashboard's `/api/audio` route (and the audio download script) fetch call
  recordings from Zoho's web endpoint using this cookie. It EXPIRES every few
  days/weeks; when audio playback breaks, the fix is: log into Zoho CRM in a
  browser → DevTools → Network → copy the request Cookie header → paste as
  ZOHO_COOKIE. This is the most fragile part of the system.
- **SARVAM_API_KEY** is shared with another of the user's projects (they chose
  to reuse it) — rate limits/billing are pooled.
- The user pastes secrets into .env themselves; Claude verifies by length or
  prefix only, never asks for or echoes values.

## Decisions & policies (with the why)

- **STT: Sarvam Saaras v3** (`saaras:v3`, batch API, `translit` output mode →
  romanised Hinglish). Chosen over Whisper/Deepgram/AssemblyAI/GPT-4o on
  Indian-telephony WER benchmarks; Whisper explicitly disqualified
  (hallucinates on hold music/dead air). Details + citations in PLAN.md.
- **Summaries/FAQ model: gpt-4.1-mini via OpenAI.** OPENROUTER_API_KEY with the
  free Nemotron model is a fallback path only (50 req/day cap). **Never switch
  models — even for a test run — without asking the user first; model cost is
  their call.** (SUMMARY_MODEL / SUMMARY_PROVIDER env overrides exist.)
- **Evidence policy (load-bearing for trust):** every LLM-extracted claim
  carries a verbatim quote that is programmatically verified against the
  transcript (`_norm()` substring check; `"..."` splits allowed). Unverifiable
  quotes are nulled ("a missing quote is honest, an invented one is not"). In
  FAQ extraction this goes further: a customer question with NO verified quote
  is dropped entirely — spot-checks caught gpt-4.1-mini inventing plausible
  questions ("do you do installation?") on calls where nobody asked. Keep this
  bar if you extend the pipeline.
- **Region buckets** come from `transcripts.city` via `CITY_REGION` in
  `scripts/aggregate_faqs.py` (Bengaluru / Delhi NCR / Hyderabad / Mumbai /
  Pune / Gujarat / Kolkata / Chennai / Other / Unknown). City comes from the
  linked Zoho Lead (`State1`/`City`) or Contact (`Mailing_*`), joined via the
  Call's `Who_Id`/`What_Id` (`scripts/backfill_call_states.py`). Meta-ads/IVR
  leads often have no city → ~30% Unknown; fixing that means capturing city at
  lead entry, not code.
- **Transcripts contain real customer PII** (names, phones, addresses on all
  723 calls). Sending transcript content to any NEW external service/vendor
  requires the user's explicit yes first. OpenAI, Sarvam, Supabase, Zoho are
  already approved. Keep `out/` and audio out of git (gitignore already does).
- The dashboard's Next.js version is newer than most training data —
  `dashboard/AGENTS.md` says to check `node_modules/next/dist/docs/` before
  writing dashboard code; in practice, mirror the idioms of the existing pages.

## Costs so far (for expectation-setting)

Transcription ~₹1,300; summaries ~$0.50 total across runs; FAQ extraction
$0.69 + aggregation ~$0.17. Full-corpus LLM passes with gpt-4.1-mini cost
roughly $1 per sweep of all 723 calls.

## Unfinished business (in priority order)

1. **Vercel deployment — pending.** The user wants the dashboard live on
   Vercel with parity to localhost. Blockers hit: MCP connector is read-only
   (403), no Vercel CLI auth existed on the machine, and CLI device-login codes
   (`npx vercel login`, ~5-min lifetime) kept expiring un-clicked. Resume plan:
   run `npx -y vercel@latest login`, have the user click the device URL, then
   `vercel link` (create project, root dir `dashboard/`), add the 8 env vars
   (`vercel env add` for: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN,
   ZOHO_ACCOUNTS_DOMAIN, ZOHO_API_DOMAIN, ZOHO_COOKIE), `vercel --prod`, then
   probe every page + API route on the live URL. Also decide deployment
   protection: the dashboard has NO auth of its own and exposes customer PII —
   flag this to the user before making it public.
2. **Ozonetel**: recordings retention is ~1 month rolling — historical audio
   is being lost continuously. Real API credentials (apiKey/userName) need a
   support ticket. Would also remove the ZOHO_COOKIE fragility.
3. 4 calls have no FAQ extraction (empty transcripts) — nothing to do unless
   re-transcribed.
4. `needs_clarification` answers in the FAQ section are all `pending_review` —
   the business must confirm the `[CONFIRM: …]` gaps before sales training
   uses them.

## Bootstrap checklist for a clone

1. `git clone https://github.com/Magppie1234/Call-Transcription.git`
2. Copy `.env` and `dashboard/.env.local` from the original folder (or refill
   from this kit's `.env.example`).
3. Python: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`.
4. Dashboard: `cd dashboard && npm install && npm run dev`.
5. If scripts need local transcripts, pull them from the Supabase `transcripts`
   table back into `out/transcripts/` (write the inverse of
   `scripts/sync_transcripts_to_supabase.py`), or copy `out/` from the
   original machine.
6. Drop the `claude-memory/` files into the new session's memory directory (or
   just tell Claude to read them) so the working-style rules carry over.
