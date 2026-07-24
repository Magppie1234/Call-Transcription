import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Proxy the audio stream through the server using the stored cookie
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 });
  }

  const cookie = process.env.ZOHO_COOKIE;
  if (!cookie) {
    return NextResponse.json({ error: 'ZOHO_COOKIE not configured' }, { status: 500 });
  }

  const res = await fetch(url, {
    headers: {
      Cookie: cookie,
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) {
    return NextResponse.json({ error: `Upstream error: ${res.status}` }, { status: res.status });
  }

  const contentType = res.headers.get('content-type') || 'audio/mpeg';
  const audioBuffer = await res.arrayBuffer();

  return new Response(audioBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(audioBuffer.byteLength),
      'Accept-Ranges': 'bytes',
    },
  });
}
