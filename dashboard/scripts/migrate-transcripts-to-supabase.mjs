#!/usr/bin/env node
// One-time migration: upload existing local transcripts (out/transcripts/*.mp3.json)
// into the Supabase `transcripts` table, so the deployed dashboard (which has
// no local disk) can read them.
//
// Usage (from dashboard/, after running supabase-schema.sql and adding
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY to .env.local):
//   node --env-file=.env.local scripts/migrate-transcripts-to-supabase.mjs
//
// Safe to re-run — upserts by call_id.

import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRANSCRIPTS_DIR = path.join(__dirname, '..', '..', 'out', 'transcripts');
const BATCH_SIZE = 100;

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.');
    console.error('   Run: node --env-file=.env.local scripts/migrate-transcripts-to-supabase.mjs');
    process.exit(1);
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const files = (await readdir(TRANSCRIPTS_DIR)).filter(f => f.endsWith('.mp3.json'));
  console.log(`📄 ${files.length} local transcripts found`);

  let uploaded = 0, failed = 0;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const rows = await Promise.all(batch.map(async f => ({
      call_id: f.replace(/\.mp3\.json$/, ''),
      transcript: JSON.parse(await readFile(path.join(TRANSCRIPTS_DIR, f), 'utf-8')),
    })));

    const { error } = await supabase.from('transcripts').upsert(rows, { onConflict: 'call_id' });
    if (error) {
      failed += batch.length;
      console.error(`  ❌ batch at ${i}: ${error.message}`);
    } else {
      uploaded += batch.length;
    }
    process.stdout.write(`\r  ${Math.min(i + BATCH_SIZE, files.length)}/${files.length} processed`);
  }

  console.log(`\n\n✅ Done. Uploaded ${uploaded}, failed ${failed}.`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
