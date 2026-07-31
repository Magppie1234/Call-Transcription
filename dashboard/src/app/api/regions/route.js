import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Caller location, aggregated by state and by city. Both come from the linked
// Zoho Lead/Contact/Account (see scripts/backfill_call_states.py) and are stored
// per-call on `transcripts`.
export async function GET() {
  try {
    const rows = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('transcripts').select('call_id,state,city').range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      rows.push(...data);
      if (data.length < PAGE) break;
    }

    const tally = (key) => {
      const counts = new Map();
      for (const r of rows) {
        const v = r[key]?.trim();
        if (v) counts.set(v, (counts.get(v) || 0) + 1);
      }
      return [...counts.entries()]
        .map(([name, calls]) => ({ name, calls }))
        .sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name));
    };

    const states = tally('state');
    const cities = tally('city');

    return NextResponse.json({
      totalCalls: rows.length,
      withState: states.reduce((n, s) => n + s.calls, 0),
      withCity: cities.reduce((n, c) => n + c.calls, 0),
      states,
      cities,
    });
  } catch (err) {
    console.error('Regions API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
