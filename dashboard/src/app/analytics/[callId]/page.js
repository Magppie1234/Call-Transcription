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
  const hasRequirements = req.kitchenType || req.budget || req.location || req.timeline;

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

      <div className="panel-grid">
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

      {/* Requirements */}
      {hasRequirements && (
        <section className="panel">
          <h3 className="panel-title">Customer Requirements</h3>
          <table className="kv-table">
            <tbody>
              {req.kitchenType && <tr><th>Kitchen type</th><td>{req.kitchenType}</td></tr>}
              {req.budget && <tr><th>Budget</th><td>{req.budget}</td></tr>}
              {req.location && <tr><th>Location</th><td>{req.location}</td></tr>}
              {req.timeline && <tr><th>Timeline</th><td>{req.timeline}</td></tr>}
            </tbody>
          </table>
        </section>
      )}

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
