# Call Transcription — Handoff Kit

Give this folder (or the zip) to a fresh Claude Code session to recreate the
project with all its context. Contains NO live secrets by design.

## Contents

- `PROJECT_CONTEXT.md` — everything important that is not visible in the code:
  account topology, credential quirks, decisions and why, data state, and the
  unfinished work. **Start here.**
- `.env.example` — annotated list of every env var both halves of the project
  need. Copy real values from the original machine's `.env` and
  `dashboard/.env.local` (folder: `/Users/UNICA/Desktop/call transcription`).
- `claude-memory/` — the persistent memory files from the original Claude Code
  sessions (working-style rules + project facts). Place them in the new
  session's memory directory, or just ask Claude to read them.

## Quick start in a new Claude Code window

1. Unzip somewhere, open Claude Code in an empty folder.
2. Say: *"Read the handoff kit at <path>, then clone and set up the project it
   describes."*
3. Paste the two env files yourself when asked (never into the chat).

The code lives at https://github.com/Magppie1234/Call-Transcription — the kit
is only the knowledge layer on top of it.
