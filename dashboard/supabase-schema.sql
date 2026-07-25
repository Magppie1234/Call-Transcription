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
