'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import './analytics.css';

const OUTCOME_LABELS = {
  interested: 'Interested', not_interested: 'Not interested',
  callback_requested: 'Callback requested', follow_up_needed: 'Follow-up needed',
  not_reachable: 'Not reachable', wrong_number: 'Wrong number',
  already_purchased: 'Already purchased', unclear: 'Unclear',
};

function formatDate(iso) {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  return { date: d.toISOString().slice(0, 10), time: d.toTimeString().slice(0, 5) };
}

function scoreBand(score) {
  if (score == null) return 'med';
  if (score >= 4) return 'high';
  if (score >= 3) return 'med';
  return 'low';
}

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/analytics?range=all')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const calls = data?.calls || [];
  const q = search.trim().toLowerCase();
  const filtered = calls.filter(c => {
    if (filter !== 'all' && c.status !== filter) return false;
    if (!q) return true;
    return c.customer.toLowerCase().includes(q) || c.agent.toLowerCase().includes(q);
  });

  return (
    <main className="analytics-main">
      <div className="analytics-header">
        <div>
          <h1 className="title-header">Analytics</h1>
          <p className="subtitle">
            {data ? `${data.meta.total} calls analyzed` : 'Per-call analysis and coaching insights'}
          </p>
        </div>
      </div>

      {loading && <div className="state-box">Loading analytics…</div>}

      {!loading && data && data.meta.total === 0 && (
        <div className="state-box">
          No calls have been analyzed yet.<br />
          <span className="muted">Run scripts/summarize_calls.py to generate analysis data.</span>
        </div>
      )}

      {!loading && data && data.meta.total > 0 && (
        <>
          <div className="stat-row">
            <div className="stat-box">
              <span className="stat-label">Avg Professionalism</span>
              <span className="stat-value">{data.topline.avgProfessionalism ?? '—'}<small>/5</small></span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Avg Politeness</span>
              <span className="stat-value">{data.topline.avgPoliteness ?? '—'}<small>/5</small></span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Avg Agent Talk Time</span>
              <span className="stat-value">{data.topline.avgTalkPct ?? '—'}<small>%</small></span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Interested Leads</span>
              <span className="stat-value">{data.topline.pctInterested}<small>%</small></span>
            </div>
          </div>

          <p className="scoring-note">
            Scores averaged over the {data.meta.scoredCount} calls with a real conversation.
            {data.meta.noConversationCount > 0 && (
              <> {data.meta.noConversationCount} voicemail/unanswered calls are listed but not scored —
              the agent barely spoke, so rating them would unfairly drag their averages down.</>
            )}
          </p>

          <div className="controls-row">
            <div className="filter-tabs">
              <button className={`filter-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                All Calls <span className="tab-count">{data.meta.total}</span>
              </button>
              <button
                className={`filter-tab tab-attention ${filter === 'needs_attention' ? 'active' : ''}`}
                onClick={() => setFilter('needs_attention')}
              >
                Needs Attention <span className="tab-count">{data.meta.needsAttentionCount}</span>
              </button>
              <button
                className={`filter-tab tab-good ${filter === 'good' ? 'active' : ''}`}
                onClick={() => setFilter('good')}
              >
                Good <span className="tab-count">{data.meta.goodCount}</span>
              </button>
              {data.meta.noConversationCount > 0 && (
                <button
                  className={`filter-tab ${filter === 'no_conversation' ? 'active' : ''}`}
                  onClick={() => setFilter('no_conversation')}
                >
                  No Conversation <span className="tab-count">{data.meta.noConversationCount}</span>
                </button>
              )}
            </div>
            <input
              type="text"
              className="search-input"
              placeholder="Search customer or agent…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>CUSTOMER</th>
                  <th>AGENT</th>
                  <th>DATE</th>
                  <th>OUTCOME</th>
                  <th>SENTIMENT</th>
                  <th className="col-center">PROF.</th>
                  <th className="col-center">POLITE</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="empty-cell">No calls match this filter.</td></tr>
                )}
                {filtered.map(c => {
                  const { date, time } = formatDate(c.startTime);
                  return (
                    <tr key={c.callId}>
                      <td>
                        <Link href={`/analytics/${c.callId}`} className="name-link">
                          {c.customer}
                        </Link>
                      </td>
                      <td>{c.agent}</td>
                      <td className="col-date">{date}<span className="time-sub">{time}</span></td>
                      <td>{OUTCOME_LABELS[c.callOutcome] || c.callOutcome}</td>
                      <td>
                        <span className={`dot dot-${c.customerSentiment}`} />
                        {c.customerSentiment}
                      </td>
                      <td className="col-center">
                        {c.hadConversation
                          ? <span className={`score-badge score-badge-${scoreBand(c.agentProfessionalism)}`}>
                              {c.agentProfessionalism ?? '—'}
                            </span>
                          : <span className="not-scored" title="Not scored — no conversation">—</span>}
                      </td>
                      <td className="col-center">
                        {c.hadConversation
                          ? <span className={`score-badge score-badge-${scoreBand(c.agentPoliteness)}`}>
                              {c.agentPoliteness ?? '—'}
                            </span>
                          : <span className="not-scored" title="Not scored — no conversation">—</span>}
                      </td>
                      <td>
                        {c.status === 'no_conversation'
                          ? <span className="badge badge-neutral">No conversation</span>
                          : c.status === 'needs_attention'
                            ? <span className="badge badge-negative">{c.reasons[0]}</span>
                            : <span className="badge badge-positive">Good</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
