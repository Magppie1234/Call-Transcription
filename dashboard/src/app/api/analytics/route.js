import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const LIST_COLS =
  'call_id, agent, customer, start_time, duration_seconds, agent_talk_pct, num_turns, ' +
  'call_outcome, customer_sentiment, interest_level, agent_politeness, ' +
  'agent_professionalism, red_flags, objections, summary';

// Voicemail / IVR / answering-machine pickups get politeness+professionalism
// scores from the model even though the agent barely spoke and no two-way
// exchange happened — which unfairly drags down the agent's averages.
// num_turns comes from diarization (ground truth, not the LLM). In the data so
// far every no-conversation call has <=5 turns and every real dialogue has >=10,
// so 8 sits safely in the gap. Topic doesn't matter: a wrong number where the
// two people actually talked still counts as a conversation.
const MIN_TURNS_FOR_CONVERSATION = 8;

const hadConversation = r => (r.num_turns ?? 0) >= MIN_TURNS_FOR_CONVERSATION;

// Paginated fetch — PostgREST caps at 1000 rows/request by default.
async function fetchAllSummaries(cutoffIso) {
  let rows = [], from = 0;
  const PAGE = 1000;
  while (true) {
    let q = supabase.from('call_summaries').select(LIST_COLS)
      .order('start_time', { ascending: false })
      .range(from, from + PAGE - 1);
    if (cutoffIso) q = q.gte('start_time', cutoffIso);
    const { data, error } = await q;
    if (error) throw error;
    rows = rows.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

const round1 = n => Math.round(n * 10) / 10;

function avg(rows, key) {
  const vals = rows.map(r => r[key]).filter(v => v != null);
  if (!vals.length) return null;
  return round1(vals.reduce((a, b) => a + b, 0) / vals.length);
}

// A call needs attention if anything went wrong: an explicit red flag,
// a poor professionalism score, or a negative customer reaction.
function attentionReasons(r) {
  const reasons = [];
  if ((r.red_flags || []).length > 0) reasons.push('Red flag');
  if (r.agent_professionalism != null && r.agent_professionalism <= 2) reasons.push('Low professionalism');
  if (r.customer_sentiment === 'negative') reasons.push('Negative sentiment');
  return reasons;
}

function toListItem(r) {
  const scored = hadConversation(r);
  // A voicemail can't be "rude" — don't flag the agent over a call that never happened.
  const reasons = scored ? attentionReasons(r) : [];
  return {
    callId: r.call_id,
    customer: r.customer,
    agent: r.agent,
    startTime: r.start_time,
    durationSeconds: r.duration_seconds,
    numTurns: r.num_turns,
    callOutcome: r.call_outcome,
    customerSentiment: r.customer_sentiment,
    interestLevel: r.interest_level,
    agentPoliteness: r.agent_politeness,
    agentProfessionalism: r.agent_professionalism,
    agentTalkPct: r.agent_talk_pct,
    objectionCount: (r.objections || []).length,
    redFlags: r.red_flags || [],
    summary: r.summary,
    hadConversation: scored,
    status: !scored ? 'no_conversation' : (reasons.length ? 'needs_attention' : 'good'),
    reasons,
  };
}

// Single-call detail: every analysis field for one call.
async function getOne(callId) {
  const { data, error } = await supabase
    .from('call_summaries').select('*').eq('call_id', callId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    callId: data.call_id,
    customer: data.customer,
    agent: data.agent,
    callType: data.call_type,
    startTime: data.start_time,
    durationSeconds: data.duration_seconds,
    agentTalkPct: data.agent_talk_pct,
    customerTalkPct: data.customer_talk_pct,
    numTurns: data.num_turns,
    summary: data.summary,
    callOutcome: data.call_outcome,
    nextAction: data.next_action,
    customerSentiment: data.customer_sentiment,
    interestLevel: data.interest_level,
    agentPoliteness: data.agent_politeness,
    agentProfessionalism: data.agent_professionalism,
    professionalismNotes: data.professionalism_notes,
    requirements: {
      kitchenType: data.kitchen_type, budget: data.budget,
      location: data.location, timeline: data.timeline,
    },
    objections: data.objections || [],
    actionItems: data.action_items || [],
    redFlags: data.red_flags || [],
    language: data.language,
    model: data.model,
    summarizedAt: data.summarized_at,
    hadConversation: hadConversation(data),
    status: !hadConversation(data) ? 'no_conversation'
      : (attentionReasons(data).length ? 'needs_attention' : 'good'),
    reasons: hadConversation(data) ? attentionReasons(data) : [],
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const callId = searchParams.get('callId');

    if (callId) {
      const one = await getOne(callId);
      if (!one) return NextResponse.json({ error: 'Not analyzed' }, { status: 404 });
      return NextResponse.json(one);
    }

    const range = searchParams.get('range') || 'all';
    const cutoffIso = range === 'all' ? null
      : new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000).toISOString();

    const rows = await fetchAllSummaries(cutoffIso);
    const calls = rows.map(toListItem);

    // Agent-behaviour averages are computed over real conversations only —
    // scoring voicemails would penalise agents for calls nobody answered.
    const scoredRows = rows.filter(hadConversation);
    const needsAttentionCount = calls.filter(c => c.status === 'needs_attention').length;
    const noConversationCount = calls.filter(c => c.status === 'no_conversation').length;

    return NextResponse.json({
      meta: {
        range,
        total: calls.length,
        needsAttentionCount,
        goodCount: calls.length - needsAttentionCount - noConversationCount,
        noConversationCount,
        scoredCount: scoredRows.length,
      },
      topline: scoredRows.length ? {
        avgProfessionalism: avg(scoredRows, 'agent_professionalism'),
        avgPoliteness: avg(scoredRows, 'agent_politeness'),
        avgTalkPct: avg(scoredRows, 'agent_talk_pct'),
        pctInterested: round1(
          (100 * scoredRows.filter(r => r.call_outcome === 'interested').length) / scoredRows.length
        ),
      } : null,
      calls,
    });
  } catch (err) {
    console.error('Analytics API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
