'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import './analytics.css';

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return { date: d.toISOString().slice(0, 10), time: d.toTimeString().slice(0, 5) };
}

const OUTCOME_LABELS = {
  interested: 'Interested', not_interested: 'Not interested',
  callback_requested: 'Callback requested', follow_up_needed: 'Follow-up needed',
  not_reachable: 'Not reachable', wrong_number: 'Wrong number',
  already_purchased: 'Already purchased', unclear: 'Unclear',
};

const REASON_LABELS = {
  red_flag: 'Red flag', low_professionalism: 'Low professionalism', negative_sentiment: 'Negative sentiment',
};

function scoreBand(score) {
  if (score == null) return 'med';
  if (score >= 4) return 'high';
  if (score >= 2.5) return 'med';
  return 'low';
}

function BarList({ rows, labelFor, total }) {
  if (!rows.length) return <div className="empty-note">No data yet.</div>;
  const max = Math.max(...rows.map(r => r.count));
  return (
    <div className="bar-list">
      {rows.map((r, i) => (
        <div className="bar-row" key={i}>
          <div className="bar-label">{labelFor(r)}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(100 * r.count) / max}%` }} />
          </div>
          <div className="bar-count">{r.count}</div>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [range, setRange] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = (r) => {
    setLoading(true);
    fetch(`/api/analytics?range=${r}`)
      .then(res => res.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(range); }, [range]);

  return (
    <main className="analytics-main">
      <div className="analytics-header-section">
        <div>
          <h1 className="title-header">Analytics</h1>
          <p className="subtitle">Coaching insights from analyzed calls</p>
        </div>
        <div className="pill-group">
          {[['30', 'Last 30 days'], ['90', 'Last 90 days'], ['all', 'All time']].map(([v, label]) => (
            <button key={v} className={`pill ${range === v ? 'active' : ''}`} onClick={() => setRange(v)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="loading-state">Loading analytics…</div>}

      {!loading && data && data.meta.totalCalls === 0 && (
        <div className="loading-state">
          No calls have been analyzed yet.<br />
          <span className="muted-text">Run scripts/summarize_calls.py to generate coaching data.</span>
        </div>
      )}

      {!loading && data && data.meta.totalCalls > 0 && (
        <div className="analytics-content">
          {/* Top-line stat tiles */}
          <div className="metrics-grid">
            <div className="metric-card">
              <h3>Calls Analyzed</h3>
              <div className="metric-val">{data.topline.totalCallsAnalyzed}</div>
            </div>
            <div className="metric-card">
              <h3>Avg Professionalism</h3>
              <div className="metric-val">{data.topline.avgAgentProfessionalism ?? '—'}/5</div>
            </div>
            <div className="metric-card">
              <h3>Avg Politeness</h3>
              <div className="metric-val">{data.topline.avgAgentPoliteness ?? '—'}/5</div>
            </div>
            <div className="metric-card">
              <h3>Red-Flagged Calls</h3>
              <div className="metric-val">{data.topline.pctRedFlagged}%</div>
            </div>
            <div className="metric-card">
              <h3>Most Common Outcome</h3>
              <div className="metric-val metric-val-text">
                {OUTCOME_LABELS[data.outcomeBreakdown[0]?.outcome] || '—'}
              </div>
            </div>
          </div>

          <div className="analytics-grid">
            {/* Needs Attention queue */}
            <div className="table-container span-2">
              <h3 className="section-title">Needs Attention</h3>
              {data.needsAttention.length === 0 ? (
                <div className="empty-note">Nothing flagged — no red flags, low scores, or negative sentiment.</div>
              ) : (
                <table className="calls-table">
                  <thead>
                    <tr>
                      <th>CUSTOMER</th><th>AGENT</th><th>DATE</th><th>REASON</th><th>SENTIMENT</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.needsAttention.map(c => {
                      const { date, time } = formatDate(c.startTime);
                      return (
                        <tr key={c.callId} className="table-row">
                          <td className="customer-name">{c.customer}</td>
                          <td className="agent-cell">{c.agent}</td>
                          <td className="date-cell">
                            <span>{date}</span>
                            <span className="time-badge">{time}</span>
                          </td>
                          <td>
                            <span className="badge badge-negative">
                              {c.reasons.map(r => REASON_LABELS[r]).join(', ')}
                            </span>
                          </td>
                          <td>
                            <span className={`dot dot-${c.customerSentiment}`} />
                            {c.customerSentiment}
                          </td>
                          <td>
                            <Link href={`/calls/${c.callId}`} className="view-btn" title="Open transcript & recording">
                              View <span className="view-arrow">→</span>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Top objections */}
            <div className="table-container">
              <h3 className="section-title">Top Customer Objections</h3>
              <BarList rows={data.topObjections} labelFor={r => r.objection} />
            </div>

            {/* Outcome breakdown */}
            <div className="table-container">
              <h3 className="section-title">Call Outcomes</h3>
              <BarList rows={data.outcomeBreakdown} labelFor={r => OUTCOME_LABELS[r.outcome] || r.outcome} />
            </div>

            {/* Sentiment breakdown */}
            <div className="table-container">
              <h3 className="section-title">Customer Sentiment</h3>
              <div className="sentiment-summary">
                {data.sentimentBreakdown.map(s => (
                  <div className="sentiment-row" key={s.sentiment}>
                    <span className={`dot dot-${s.sentiment}`} />
                    <span className={`badge badge-${s.sentiment}`}>{s.sentiment}</span>
                    <span className="sentiment-count">{s.count} calls ({s.pct}%)</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Per-agent scorecard */}
            <div className="table-container span-2">
              <h3 className="section-title">Agent Scorecard</h3>
              <table className="calls-table">
                <thead>
                  <tr>
                    <th>AGENT</th><th>CALLS</th><th>PROFESSIONALISM</th><th>POLITENESS</th>
                    <th>TALK RATIO</th><th>RED FLAGS</th><th>TOP OUTCOME</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agentScorecards.map(a => (
                    <tr key={a.agent} className="table-row">
                      <td className="customer-name">{a.agent}</td>
                      <td>{a.callCount}</td>
                      <td>
                        <span className={`score-badge score-badge-${scoreBand(a.avgProfessionalism)}`}>
                          {a.avgProfessionalism ?? '—'}
                        </span>
                      </td>
                      <td>{a.avgPoliteness ?? '—'}</td>
                      <td>
                        <div className="meter">
                          <div className="meter-track">
                            <div
                              className={`meter-fill ${a.avgTalkPct >= 40 && a.avgTalkPct <= 60 ? 'meter-good' : 'meter-warn'}`}
                              style={{ width: `${Math.min(a.avgTalkPct ?? 0, 100)}%` }}
                            />
                          </div>
                          <span className="meter-label">{a.avgTalkPct ?? '—'}%</span>
                        </div>
                      </td>
                      <td>
                        {a.pctRedFlagged > 0
                          ? <span className="badge badge-negative">{a.pctRedFlagged}%</span>
                          : <span className="badge badge-neutral">0%</span>}
                      </td>
                      <td><span className="badge badge-neutral">{OUTCOME_LABELS[a.topOutcome] || '—'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
