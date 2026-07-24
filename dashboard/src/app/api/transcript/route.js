import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const callId = searchParams.get('callId');

  if (!callId) {
    return NextResponse.json({ error: 'Missing callId' }, { status: 400 });
  }

  // Look for a pre-existing transcript JSON in out/transcripts/
  const transcriptsDir = path.join(process.cwd(), '..', 'out', 'transcripts');
  const filePath = path.join(transcriptsDir, `${callId}.mp3.json`);

  if (fs.existsSync(filePath)) {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(fileContent);
    return NextResponse.json({ status: 'ready', transcript: data });
  }

  // No transcript yet
  return NextResponse.json({ status: 'not_found' }, { status: 404 });
}
