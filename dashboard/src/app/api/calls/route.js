import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Only show recordings from the last month (rolling 30-day window)
const RECENT_DAYS = 30;

async function readTokenCache() {
  const { data } = await supabase.from('app_kv').select('value').eq('key', 'zoho_token_cache').maybeSingle();
  return data?.value || { token: null, expiresAt: 0 };
}

async function writeTokenCache(token, expiresIn) {
  const cache = { token, expiresAt: Date.now() + (expiresIn || 3600) * 1000 };
  await supabase.from('app_kv').upsert({ key: 'zoho_token_cache', value: cache, updated_at: new Date().toISOString() });
  return cache;
}

// All call_ids from a table, fetched once per request instead of one lookup
// per call. Paginated: PostgREST returns at most 1000 rows per request, so a
// single select would silently truncate once the corpus passes 1000.
//
// Errors deliberately propagate rather than resolving to an empty Set: the
// caller filters the call list down to ids present here, so swallowing a
// failure would hide it as a plausible-looking "no calls found" instead of
// surfacing the real cause (e.g. Supabase env vars missing in deployment).
async function listIds(table) {
  const ids = new Set();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table).select('call_id').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const r of data) ids.add(r.call_id);
    if (data.length < PAGE) return ids;
  }
}

const listTranscriptIds = () => listIds('transcripts');
const listSummarizedIds = () => listIds('call_summaries');

async function getZohoToken() {
  // Return cached token if still valid (with 2 min buffer)
  const cached = await readTokenCache();
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
      await writeTokenCache(json.access_token, json.expires_in);
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

function formatCall(c, transcriptIds, summarizedIds) {
  const customerRec = c.What_Id || c.Who_Id;
  const customerName = customerRec?.name || 'Unknown';
  const phoneMatch = c.Subject?.match(/\((\+\d+)\)/);
  const phone = phoneMatch ? phoneMatch[1] : '';
  const hasTranscript = transcriptIds.has(c.id);
  const hasSummary = summarizedIds.has(c.id);

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
    hasSummary,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const callId = searchParams.get('callId');

  try {
    const [token, transcriptIds, summarizedIds] = await Promise.all([
      getZohoToken(), listTranscriptIds(), listSummarizedIds(),
    ]);
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
      return NextResponse.json(formatCall(record, transcriptIds, summarizedIds));
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

    // Keep only calls that have a recording, happened in the last month, AND
    // actually have a transcript — this list only shows calls with a transcription.
    const calls = allRecords.filter(c => {
      if (!c.Voice_Recording__s) return false;
      if (!transcriptIds.has(c.id)) return false;
      const t = c.Call_Start_Time ? new Date(c.Call_Start_Time).getTime() : NaN;
      return !isNaN(t) && t >= cutoff;
    });
    return NextResponse.json(calls.map(c => formatCall(c, transcriptIds, summarizedIds)));
  } catch (err) {
    console.error('Calls API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
