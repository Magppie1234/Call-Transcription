#!/usr/bin/env node
// One-time migration: upload existing local transcripts (out/transcripts/*.mp3.json)
// to Vercel Blob, so the deployed dashboard can read them (it has no local disk).
//
// Usage (from dashboard/, after creating a Blob store and adding
// BLOB_READ_WRITE_TOKEN to dashboard/.env.local):
//   node --env-file=.env.local scripts/migrate-transcripts-to-blob.mjs
//
// Safe to re-run — already-uploaded transcripts are skipped.

import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { list, put } from '@vercel/blob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRANSCRIPTS_DIR = path.join(__dirname, '..', '..', 'out', 'transcripts');
const CONCURRENCY = 8;

async function alreadyUploaded() {
  const ids = new Set();
  let cursor;
  do {
    const res = await list({ prefix: 'transcripts/', cursor, limit: 1000 });
    for (const b of res.blobs) {
      const m = b.pathname.match(/^transcripts\/(.+)\.mp3\.json$/);
      if (m) ids.add(m[1]);
    }
    cursor = res.hasMore ? res.cursor : undefined;
  } while (cursor);
  return ids;
}

async function uploadOne(file) {
  const id = file.replace(/\.mp3\.json$/, '');
  const content = await readFile(path.join(TRANSCRIPTS_DIR, file), 'utf-8');
  await put(`transcripts/${id}.mp3.json`, content, {
    access: 'private',
    contentType: 'application/json',
    allowOverwrite: true,
  });
  return id;
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('❌ BLOB_READ_WRITE_TOKEN not set. Create a Blob store in the Vercel');
    console.error('   dashboard (Storage tab), copy the token into dashboard/.env.local,');
    console.error('   then run: node --env-file=.env.local scripts/migrate-transcripts-to-blob.mjs');
    process.exit(1);
  }

  const allFiles = (await readdir(TRANSCRIPTS_DIR)).filter(f => f.endsWith('.mp3.json'));
  console.log(`📄 ${allFiles.length} local transcripts found`);

  const done = await alreadyUploaded();
  console.log(`☁️  ${done.size} already in Blob storage`);

  const todo = allFiles.filter(f => !done.has(f.replace(/\.mp3\.json$/, '')));
  if (!todo.length) {
    console.log('🎉 Nothing to upload — Blob storage is already up to date.');
    return;
  }
  console.log(`⬆️  Uploading ${todo.length} transcript(s)...\n`);

  let uploaded = 0, failed = 0;
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(uploadOne));
    for (const r of results) {
      if (r.status === 'fulfilled') uploaded++;
      else { failed++; console.error(`  ❌ ${r.reason?.message || r.reason}`); }
    }
    process.stdout.write(`\r  ${uploaded + failed}/${todo.length} processed`);
  }

  console.log(`\n\n✅ Done. Uploaded ${uploaded}, failed ${failed}.`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
