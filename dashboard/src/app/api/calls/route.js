import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// File-based token cache to survive server restarts and avoid Zoho rate limits
const TOKEN_CACHE_FILE = path.join(process.cwd(), '..', '.zoho_token_cache.json');

// Only show recordings from the last month (rolling 30-day window)
const RECENT_DAYS = 30;

function readTokenCache() {
  try {
    if (fs.existsSync(TOKEN_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(TOKEN_CACHE_FILE, 'utf-8'));
    }
  } catch {}
  return { token: null, expiresAt: 0 };
}

function writeTokenCache(token, expiresIn) {
  const cache = {
    token,
    expiresAt: Date.now() + (expiresIn || 3600) * 1000,
  };
  try { fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify(cache)); } catch {}
  return cache;
}

async function getZohoToken() {
  // Return cached token if still valid (with 2 min buffer)
  const cached = readTokenCache();
  if (cached.token && Date.now() < cached.expiresAt - 120000) {
    return cached.token;
  }

  const params = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    client_id: process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });

  // Retry up to 3 times with exponential backoff
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${process.env.ZOHO_ACCOUNTS_DOMAIN}/oauth/v2/token`, {
      method: 'POST',
      body: params,
    });

    const json = await res.json();
    if (json.access_token) {
      writeTokenCache(json.access_token, json.expires_in);
      return json.access_token;
    }

    // If rate limited, wait and retry
    if (json.error === 'Access Denied') {
      const wait = (attempt + 1) * 5000;
      console.log(`Zoho rate limited, waiting ${wait}ms before retry...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    throw new Error(`Token refresh failed: ${JSON.stringify(json)}`);
  }

  throw new Error('Failed to get Zoho token after 3 retries');
}

function formatCall(c) {
  const customerRec = c.What_Id || c.Who_Id;
  const customerName = customerRec?.name || 'Unknown';
  const phoneMatch = c.Subject?.match(/\((\+\d+)\)/);
  const phone = phoneMatch ? phoneMatch[1] : '';

  // Check if we have a transcript on disk
  const transcriptsDir = path.join(process.cwd(), '..', 'out', 'transcripts');
  const transcriptFile = path.join(transcriptsDir, `${c.id}.mp3.json`);
  const hasTranscript = fs.existsSync(transcriptFile);

  return {
    id: c.id,
    subject: c.Subject || '',
    customer: { name: customerName, phone },
    agent: c.Owner?.name || 'Unknown Agent',
    callType: c.Call_Type || 'Outbound',
    startTime: c.Call_Start_Time,
    duration: c.Call_Duration || '0:00',
    disposition: c.Call_Result || c.Call_Status || '',
    recordingUrl: c.Voice_Recording__s,
    hasTranscript,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const callId = searchParams.get('callId');

  try {
    const token = await getZohoToken();
    const api = process.env.ZOHO_API_DOMAIN;
    const fields = 'id,Subject,Call_Type,Call_Duration,Call_Start_Time,Owner,Who_Id,What_Id,Voice_Recording__s,Call_Status,Call_Result';

    if (callId) {
      // Fetch a single specific call by ID
      const res = await fetch(
        `${api}/crm/v7/Calls/${callId}?fields=${fields}`,
        { headers: { Authorization: `Zoho-oauthtoken ${token}` }, cache: 'no-store' }
      );
      if (!res.ok) {
        const err = await res.text();
        console.error(`Zoho single-call error: ${res.status}`, err);
        return NextResponse.json({ error: 'Call not found' }, { status: 404 });
      }
      const data = await res.json();
      const record = data.data?.[0] || data;
      return NextResponse.json(formatCall(record));
    }

    // Paginate newest-first until we cross the last-month cutoff, then stop.
    // Zoho's page-number pagination hard-caps at 2,000 records (~8 days here),
    // so we use page_token pagination, which requires repeating the same
    // fields/per_page/sort params on every request.
    const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
    const authHeaders = { Authorization: `Zoho-oauthtoken ${token}` };
    const baseQuery = `fields=${fields}&per_page=200&sort_by=Created_Time&sort_order=desc`;
    let allRecords = [];
    let pageToken = null;

    const MAX_PAGES = 80; // safety cap (~16k calls) so it can't loop forever
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${api}/crm/v7/Calls?${baseQuery}` +
        (pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : '');
      const res = await fetch(url, { headers: authHeaders, cache: 'no-store' });
      if (!res.ok) {
        if (page === 1) {
          const err = await res.text();
          console.error(`Zoho bulk error: ${res.status}`, err);
          return NextResponse.json({ error: err }, { status: res.status });
        }
        break; // later pages failing is ok — return what we have
      }
      const d = await res.json();
      const rows = d.data || [];
      allRecords = allRecords.concat(rows);

      // Stop once this page reaches calls older than the cutoff
      const oldest = rows[rows.length - 1]?.Call_Start_Time;
      if (oldest && new Date(oldest).getTime() < cutoff) break;
      pageToken = d.info?.next_page_token;
      if (!d.info?.more_records || !pageToken) break;
    }

    // Keep only calls that have a recording AND happened in the last month
    const calls = allRecords.filter(c => {
      if (!c.Voice_Recording__s) return false;
      const t = c.Call_Start_Time ? new Date(c.Call_Start_Time).getTime() : NaN;
      return !isNaN(t) && t >= cutoff;
    });
    return NextResponse.json(calls.map(formatCall));
  } catch (err) {
    console.error('Calls API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
