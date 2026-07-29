'use client';
import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import '../analytics.css';
import './detail.css';

const OUTCOME_LABELS = {
  interested: 'Interested', not_interested: 'Not interested',
  callback_requested: 'Callback requested', follow_up_needed: 'Follow-up needed',
  not_reachable: 'Not reachable', wrong_number: 'Wrong number',
  already_purchased: 'Already purchased', unclear: 'Unclear',
};

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toISOString().slice(0, 10)} at ${d.toTimeString().slice(0, 5)}`;
}

function formatDuration(s) {
  if (!s) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function scoreBand(score) {
  if (score == null) return 'med';
  if (score >= 4) return 'high';
  if (score >= 3) return 'med';
  return 'low';
}

const DIMENSION_LABELS = {
  opening_identification: 'Opening & identification',
  need_capture: 'Need capture',
  objection_handling: 'Objection handling',
  next_step_secured: 'Next step secured',
  language_rapport: 'Language & rapport',
};

const PROPERTY_LABELS = {
  new_build: 'New build', renovation: 'Renovation', not_discussed: 'Not discussed',
};

const LIKELIHOOD_TONE = {
  hot: 'positive', warm: 'neutral', cold: 'neutral', dead: 'negative', unknown: 'neutral',
};

// A field extracted with supporting evidence. Renders nothing when the value is
// absent — a null budget is the correct answer for most calls, not a gap to fill.
function EvidenceRow({ label, field, fallback }) {
  const value = field?.value || fallback;
  if (!value) return null;
  return (
    <tr>
      <th>{label}</th>
      <td>
        {value}
        {field?.confidence && field.confidence !== 'high' && (
          <span className="confidence-tag"> {field.confidence} confidence</span>
        )}
        {field?.evidence && <div className="evidence-line">“{field.evidence}”</div>}
      </td>
    </tr>
  );
}

function ListCard({ title, items, tone = 'plain', empty }) {
  return (
    <section className="panel">
      <h3 className="panel-title">{title}</h3>
      {items.length === 0
        ? <p className="panel-empty">{empty}</p>
        : (
          <ul className={`item-list item-list-${tone}`}>
            {items.map((it, i) => <li key={i}>{it}</li>)}
          </ul>
        )}
    </section>
  );
}

export default function CallAnalysisPage({ params }) {
  const { callId } = use(params);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    fetch(`/api/analytics?callId=${callId}`)
      .then(r => {
        if (r.status === 404) { setStatus('not_found'); return null; }
        return r.json();
      })
      .then(d => { if (d) { setData(d); setStatus('ready'); } })
      .catch(() => setStatus('error'));
  }, [callId]);

  if (status === 'loading') {
    return <main className="analytics-main"><div className="state-box">Loading analysis…</div></main>;
  }
  if (status === 'not_found') {
    return (
      <main className="analytics-main">
        <Link href="/analytics" className="back-link">← Back to Analytics</Link>
        <div className="state-box">
          This call hasn&apos;t been analyzed yet.<br />
          <span className="muted">Only summarized calls appear in Analytics.</span>
        </div>
      </main>
    );
  }
  if (status === 'error' || !data) {
    return <main className="analytics-main"><div className="state-box">Could not load this analysis.</div></main>;
  }

  const req = data.requirements || {};

  // Only render a dimension the model actually returned. Rows summarized before
  // the schema expanded have no scorecard at all, so the section disappears
  // rather than showing five empty rows.
  const scorecard = Object.entries(data.scorecard || {})
    .filter(([, d]) => d && typeof d === 'object');

  const hasLeadDetails = Boolean(
    (data.propertyContext && data.propertyContext !== 'not_discussed') ||
    data.propertyDetails || req.location || req.kitchenType ||
    data.budget?.value || req.budget || data.timeline?.value || req.timeline ||
    data.stakeholders?.length || data.competitorMentioned ||
    (data.conversionLikelihood && data.conversionLikelihood !== 'unknown')
  );

  const hasCoaching = Boolean(
    data.coaching?.did_well?.length ||
    data.coaching?.improvements?.length ||
    data.coaching?.suggested_followup
  );

  return (
    <main className="analytics-main">
      <Link href="/analytics" className="back-link">← Back to Analytics</Link>

      {/* Header */}
      <div className="detail-header">
        <div>
          <h1 className="title-header">{data.customer}</h1>
          <p className="subtitle">
            {data.agent} · {formatDateTime(data.startTime)} · {formatDuration(data.durationSeconds)} · {data.callType}
          </p>
        </div>
        <div className="header-actions">
          {data.status === 'needs_attention'
            ? <span className="badge badge-negative">Needs attention</span>
            : <span className="badge badge-positive">Good</span>}
          <Link href={`/calls/${data.callId}`} className="view-btn">
            Transcript &amp; recording <span className="view-arrow">→</span>
          </Link>
        </div>
      </div>

      {/* Why flagged */}
      {data.reasons.length > 0 && (
        <div className="alert-bar">
          <strong>Flagged:</strong> {data.reasons.join(' · ')}
        </div>
      )}

      {!data.hadConversation && (
        <div className="info-bar">
          <strong>Not scored.</strong> This call reached a voicemail, IVR, or went unanswered
          ({data.numTurns ?? 0} speaker turns), so no real conversation took place. The agent
          barely spoke, so politeness and professionalism aren&apos;t rated here and this call
          doesn&apos;t count towards their averages.
        </div>
      )}

      {/* Summary first — the ratings belong underneath it, not above */}
      <section className="panel">
        <h3 className="panel-title">Call Summary</h3>
        <p className="summary-text">{data.summary}</p>
        {data.nextAction && (
          <div className="next-action">
            <span className="next-action-label">Next action</span>
            <span>{data.nextAction}</span>
          </div>
        )}
      </section>

      {/* Scores */}
      <div className="stat-row">
        <div className="stat-box">
          <span className="stat-label">Professionalism</span>
          <span className={`score-badge score-badge-${scoreBand(data.agentProfessionalism)} score-lg`}>
            {data.hadConversation ? `${data.agentProfessionalism ?? '—'}/5` : '—'}
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Politeness</span>
          <span className={`score-badge score-badge-${scoreBand(data.agentPoliteness)} score-lg`}>
            {data.hadConversation ? `${data.agentPoliteness ?? '—'}/5` : '—'}
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Customer Sentiment</span>
          <span className="stat-value stat-value-sm">
            <span className={`dot dot-${data.customerSentiment}`} />{data.customerSentiment}
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Interest Level</span>
          <span className="stat-value stat-value-sm">{data.interestLevel}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Outcome</span>
          <span className="stat-value stat-value-sm">
            {OUTCOME_LABELS[data.callOutcome] || data.callOutcome}
          </span>
        </div>
      </div>

      {/* Scorecard — dimensions the call didn't exercise show N/A, never a low score */}
      {scorecard.length > 0 && (
        <section className="panel">
          <h3 className="panel-title">Call Scorecard</h3>
          <table className="score-table">
            <thead>
              <tr><th>DIMENSION</th><th>SCORE</th><th>EVIDENCE</th><th>WHAT WAS MISSED</th></tr>
            </thead>
            <tbody>
              {scorecard.map(([key, d]) => (
                <tr key={key}>
                  <td className="dim-name">{DIMENSION_LABELS[key] || key}</td>
                  <td className="col-center">
                    {d.applicable && d.score != null
                      ? <span className={`score-badge score-badge-${scoreBand(d.score)}`}>{d.score}/5</span>
                      : <span className="na-tag" title="This call gave no opportunity to demonstrate it">N/A</span>}
                  </td>
                  <td className="quote-cell">{d.evidence ? `“${d.evidence}”` : '—'}</td>
                  <td>{d.missed || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Lead details — evidence shown inline so a manager can verify without the transcript */}
      {hasLeadDetails && (
        <section className="panel">
          <h3 className="panel-title">Lead Details</h3>
          <table className="kv-table">
            <tbody>
              {data.propertyContext && data.propertyContext !== 'not_discussed' && (
                <tr><th>Property</th><td>{PROPERTY_LABELS[data.propertyContext] || data.propertyContext}</td></tr>
              )}
              {data.propertyDetails && <tr><th>Details</th><td>{data.propertyDetails}</td></tr>}
              {req.location && <tr><th>Location</th><td>{req.location}</td></tr>}
              {req.kitchenType && <tr><th>Kitchen type</th><td>{req.kitchenType}</td></tr>}
              <EvidenceRow label="Budget" field={data.budget} fallback={req.budget} />
              <EvidenceRow label="Timeline" field={data.timeline} fallback={req.timeline} />
              {data.stakeholders?.length > 0 && (
                <tr><th>Others involved</th><td>{data.stakeholders.join(', ')}</td></tr>
              )}
              {data.competitorMentioned && (
                <tr><th>Also considering</th><td>{data.competitorMentioned}</td></tr>
              )}
              {data.conversionLikelihood && data.conversionLikelihood !== 'unknown' && (
                <tr>
                  <th>Conversion likelihood</th>
                  <td><span className={`badge badge-${LIKELIHOOD_TONE[data.conversionLikelihood]}`}>
                    {data.conversionLikelihood}
                  </span></td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {/* Commitments — who owes what, by when */}
      {data.commitments?.length > 0 && (
        <section className="panel">
          <h3 className="panel-title">Commitments Made</h3>
          <table className="score-table">
            <thead><tr><th>WHO</th><th>PROMISED</th><th>BY</th></tr></thead>
            <tbody>
              {data.commitments.map((c, i) => (
                <tr key={i}>
                  <td className="dim-name">{c.who === 'agent' ? data.agent : data.customer}</td>
                  <td>{c.what}</td>
                  <td>{c.due
                    ? <span className="badge badge-negative">{c.due}</span>
                    : <span className="muted-cell">no date given</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Objections with whether the agent actually responded */}
      {data.objectionsDetail?.length > 0 && (
        <section className="panel">
          <h3 className="panel-title">Objections</h3>
          <table className="score-table">
            <thead><tr><th>OBJECTION</th><th>ADDRESSED</th><th>EVIDENCE</th></tr></thead>
            <tbody>
              {data.objectionsDetail.map((o, i) => (
                <tr key={i}>
                  <td className="dim-name">{o.objection}</td>
                  <td className="col-center">
                    {o.addressed
                      ? <span className="badge badge-positive">Addressed</span>
                      : <span className="badge badge-negative">Ignored</span>}
                  </td>
                  <td className="quote-cell">{o.evidence ? `“${o.evidence}”` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Coaching */}
      {hasCoaching && (
        <section className="panel">
          <h3 className="panel-title">Coaching</h3>
          <div className="coach-grid">
            {data.coaching.did_well?.length > 0 && (
              <div>
                <h4 className="coach-heading">Did well</h4>
                <ul className="item-list">{data.coaching.did_well.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            )}
            {data.coaching.improvements?.length > 0 && (
              <div>
                <h4 className="coach-heading">Highest-impact improvements</h4>
                <ul className="item-list item-list-negative">
                  {data.coaching.improvements.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
          </div>
          {data.coaching.suggested_followup && (
            <div className="next-action">
              <span className="next-action-label">Suggested follow-up message</span>
              <span>{data.coaching.suggested_followup}</span>
            </div>
          )}
        </section>
      )}

      <div className="panel-grid">
        {data.buyingSignals?.length > 0 && (
          <ListCard title="Buying Signals" items={data.buyingSignals} empty="" />
        )}
        {data.riskFlags?.length > 0 && (
          <ListCard title="Risks" items={data.riskFlags} tone="negative" empty="" />
        )}
        <ListCard title="Objections Raised" items={data.objections} empty="No objections raised." />
        <ListCard title="Action Items" items={data.actionItems} empty="No action items recorded." />
        <ListCard title="Red Flags" items={data.redFlags} tone="negative" empty="None — no issues detected." />

        {/* Conversation stats */}
        <section className="panel">
          <h3 className="panel-title">Conversation Balance</h3>
          <div className="split-bar">
            <div className="split-agent" style={{ width: `${data.agentTalkPct ?? 50}%` }}>
              {data.agentTalkPct != null ? `${data.agentTalkPct}%` : ''}
            </div>
            <div className="split-customer" style={{ width: `${data.customerTalkPct ?? 50}%` }}>
              {data.customerTalkPct != null ? `${data.customerTalkPct}%` : ''}
            </div>
          </div>
          <div className="split-legend">
            <span><span className="legend-swatch swatch-agent" />Agent</span>
            <span><span className="legend-swatch swatch-customer" />Customer</span>
          </div>
          <table className="kv-table">
            <tbody>
              <tr><th>Speaker turns</th><td>{data.numTurns ?? '—'}</td></tr>
              <tr><th>Duration</th><td>{formatDuration(data.durationSeconds)}</td></tr>
              <tr><th>Language</th><td>{data.language || '—'}</td></tr>
            </tbody>
          </table>
        </section>
      </div>

      {/* Agent conduct notes */}
      {data.professionalismNotes && (
        <section className="panel">
          <h3 className="panel-title">Agent Conduct Notes</h3>
          <p className="summary-text">{data.professionalismNotes}</p>
        </section>
      )}

      <p className="analysis-meta">
        Analyzed {formatDateTime(data.summarizedAt)} · model: {data.model}
      </p>
    </main>
  );
}
