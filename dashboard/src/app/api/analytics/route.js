import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const SELECT_COLS =
  'call_id, agent, customer, start_time, duration_seconds, agent_talk_pct, ' +
  'customer_talk_pct, call_outcome, next_action, customer_sentiment, interest_level, ' +
  'agent_politeness, agent_professionalism, professionalism_notes, objections, red_flags, summary';

// Paginated fetch — PostgREST caps at 1000 rows/request by default.
async function fetchAllSummaries(cutoffIso) {
  let rows = [], from = 0;
  const PAGE = 1000;
  while (true) {
    let q = supabase.from('call_summaries').select(SELECT_COLS).range(from, from + PAGE - 1);
    if (cutoffIso) q = q.gte('start_time', cutoffIso);
    const { data, error } = await q;
    if (error) throw error;
    rows = rows.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function avg(rows, key) {
  const vals = rows.map(r => r[key]).filter(v => v != null);
  if (!vals.length) return null;
  return round1(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function countBy(rows, key) {
  const counts = new Map();
  for (const r of rows) {
    const v = r[key];
    if (v == null) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count, pct: round1((100 * count) / rows.length) }))
    .sort((a, b) => b.count - a.count);
}

function topStrings(rows, key, limit = 10) {
  const counts = new Map();
  for (const r of rows) {
    for (const s of r[key] || []) {
      counts.set(s, (counts.get(s) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function agentScorecards(rows) {
  const byAgent = new Map();
  for (const r of rows) {
    if (!byAgent.has(r.agent)) byAgent.set(r.agent, []);
    byAgent.get(r.agent).push(r);
  }
  return [...byAgent.entries()]
    .map(([agent, calls]) => ({
      agent,
      callCount: calls.length,
      avgProfessionalism: avg(calls, 'agent_professionalism'),
      avgPoliteness: avg(calls, 'agent_politeness'),
      avgTalkPct: avg(calls, 'agent_talk_pct'),
      pctRedFlagged: round1((100 * calls.filter(c => (c.red_flags || []).length > 0).length) / calls.length),
      topOutcome: countBy(calls, 'call_outcome')[0]?.value || null,
    }))
    .sort((a, b) => b.callCount - a.callCount);
}

function needsAttention(rows, limit = 25) {
  return rows
    .map(r => {
      const reasons = [];
      if ((r.red_flags || []).length > 0) reasons.push('red_flag');
      if (r.agent_professionalism != null && r.agent_professionalism <= 2) reasons.push('low_professionalism');
      if (r.customer_sentiment === 'negative') reasons.push('negative_sentiment');
      return reasons.length ? { ...r, reasons } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.agent_professionalism ?? 5) - (b.agent_professionalism ?? 5))
    .slice(0, limit)
    .map(r => ({
      callId: r.call_id,
      agent: r.agent,
      customer: r.customer,
      startTime: r.start_time,
      reasons: r.reasons,
      redFlags: r.red_flags || [],
      agentProfessionalism: r.agent_professionalism,
      customerSentiment: r.customer_sentiment,
      summary: r.summary,
    }));
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '90';
    const cutoffIso = range === 'all' ? null
      : new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000).toISOString();

    const rows = await fetchAllSummaries(cutoffIso);

    if (!rows.length) {
      return NextResponse.json({
        meta: { range, totalCalls: 0 },
        topline: null, outcomeBreakdown: [], sentimentBreakdown: [],
        topObjections: [], agentScorecards: [], needsAttention: [],
      });
    }

    const redFlaggedCount = rows.filter(r => (r.red_flags || []).length > 0).length;
    const interestedCount = rows.filter(r => r.call_outcome === 'interested').length;

    return NextResponse.json({
      meta: { range, totalCalls: rows.length },
      topline: {
        totalCallsAnalyzed: rows.length,
        avgAgentProfessionalism: avg(rows, 'agent_professionalism'),
        avgAgentPoliteness: avg(rows, 'agent_politeness'),
        avgAgentTalkPct: avg(rows, 'agent_talk_pct'),
        pctRedFlagged: round1((100 * redFlaggedCount) / rows.length),
        pctInterested: round1((100 * interestedCount) / rows.length),
        avgDurationSeconds: avg(rows, 'duration_seconds'),
      },
      outcomeBreakdown: countBy(rows, 'call_outcome').map(o => ({ outcome: o.value, count: o.count, pct: o.pct })),
      sentimentBreakdown: countBy(rows, 'customer_sentiment').map(s => ({ sentiment: s.value, count: s.count, pct: s.pct })),
      topObjections: topStrings(rows, 'objections').map(o => ({ objection: o.value, count: o.count })),
      agentScorecards: agentScorecards(rows),
      needsAttention: needsAttention(rows),
    });
  } catch (err) {
    console.error('Analytics API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
