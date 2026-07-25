import { NextResponse } from 'next/server';
import { get } from '@vercel/blob';

// Transcripts live in Vercel Blob (private access) — not the local filesystem,
// which doesn't exist in Vercel's serverless environment. See
// scripts/migrate-transcripts-to-blob.mjs for the one-time upload and
// scripts/sync_transcripts_to_blob.py for keeping new transcripts in sync.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const callId = searchParams.get('callId');

  if (!callId) {
    return NextResponse.json({ error: 'Missing callId' }, { status: 400 });
  }

  try {
    const result = await get(`transcripts/${callId}.mp3.json`, { access: 'private' });
    if (!result || !result.stream) {
      return NextResponse.json({ status: 'not_found' }, { status: 404 });
    }
    const data = await new Response(result.stream).json();
    return NextResponse.json({ status: 'ready', transcript: data });
  } catch (err) {
    if (err?.name === 'BlobNotFoundError') {
      return NextResponse.json({ status: 'not_found' }, { status: 404 });
    }
    console.error('Transcript blob fetch error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
