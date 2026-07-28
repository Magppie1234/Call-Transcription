-- Call transcription storage schema.
-- Run once in Supabase (SQL Editor), or via `supabase db push` if you use the CLI.

create table if not exists transcripts (
  call_id    text primary key,
  transcript jsonb not null,
  created_at timestamptz not null default now()
);

-- Small key/value table for server-side state (currently: cached Zoho OAuth token).
create table if not exists app_kv (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- RLS on with no policies: only the server-side secret key (which bypasses RLS)
-- ever touches these tables, so this is "no public access" made explicit rather
-- than relying on the tables never being queried with a public key.
alter table transcripts enable row level security;
alter table app_kv enable row level security;

-- Structured per-call analysis (sentiment, politeness, objections, red flags),
-- one row per transcribed call. Populated by scripts/summarize_calls.py.
create table if not exists call_summaries (
  call_id                 text primary key references transcripts(call_id) on delete cascade,

  -- Ground truth from Zoho (never the LLM) — so analytics never needs a
  -- live Zoho call, unlike /api/calls' rolling 30-day window.
  agent                   text not null,
  customer                text not null,
  call_type               text,
  start_time              timestamptz,
  duration_seconds        integer,

  -- Free metrics from diarization (no LLM cost)
  agent_talk_pct          smallint check (agent_talk_pct between 0 and 100),
  customer_talk_pct       smallint check (customer_talk_pct between 0 and 100),
  num_turns               integer,

  -- LLM-derived analysis
  summary                 text not null,
  call_outcome            text not null check (call_outcome in (
                             'interested','not_interested','callback_requested',
                             'follow_up_needed','not_reachable','wrong_number',
                             'already_purchased','unclear')),
  next_action             text,
  customer_sentiment      text not null check (customer_sentiment in ('positive','neutral','negative')),
  interest_level          text not null check (interest_level in ('hot','warm','cold','unknown')),
  agent_politeness        smallint not null check (agent_politeness between 1 and 5),
  agent_professionalism   smallint not null check (agent_professionalism between 1 and 5),
  professionalism_notes   text,
  kitchen_type            text,   -- flattened from customer_requirements
  budget                  text,
  location                text,
  timeline                text,
  objections              text[] not null default '{}',
  action_items            text[] not null default '{}',
  red_flags                text[] not null default '{}',
  language                text,

  model                   text not null,
  summarized_at           timestamptz not null default now()
);

create index if not exists idx_call_summaries_start_time on call_summaries (start_time desc);
create index if not exists idx_call_summaries_agent on call_summaries (agent);

alter table call_summaries enable row level security;
