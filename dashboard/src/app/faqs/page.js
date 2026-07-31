'use client';
import { useState, useEffect, useMemo } from 'react';
import './faqs.css';

const STATUS_LABELS = {
  answered_clearly: 'Answered clearly',
  answered_partially: 'Partial / vague',
  deflected: 'Deflected',
  unanswered: 'Unanswered',
};
const STATUS_ORDER = ['answered_clearly', 'answered_partially', 'deflected', 'unanswered'];

const TOPIC_LABELS = {
  pricing: 'Pricing', product_specs: 'Product specs', materials: 'Materials',
  design_options: 'Design options', installation: 'Installation', timeline: 'Timeline',
  service_area: 'Service area', showroom_visit: 'Showroom visit', process: 'Process',
  warranty_service: 'Warranty & service', payment_terms: 'Payment terms',
  company_info: 'Company info', comparison: 'Comparison', maintenance: 'Maintenance',
  other: 'Other',
};

function StatusBar({ counts }) {
  const total = STATUS_ORDER.reduce((n, s) => n + (counts[s] || 0), 0) || 1;
  return (
    <div className="status-bar" title={STATUS_ORDER.map(s => `${STATUS_LABELS[s]}: ${counts[s] || 0}`).join(' · ')}>
      {STATUS_ORDER.map(s => (counts[s] || 0) > 0 && (
        <span key={s} className={`seg seg-${s}`} style={{ flexGrow: counts[s] }} />
      ))}
    </div>
  );
}

function FaqCard({ faq }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`faq-card ${open ? 'open' : ''}`}>
      <button className="faq-head" onClick={() => setOpen(!open)}>
        <div className="faq-q">
          <span className="faq-topic">{TOPIC_LABELS[faq.topic] || faq.topic}</span>
          {faq.canonical_question}
        </div>
        <div className="faq-meta">
          <span className="faq-asks">{faq.total_asks}×</span>
          <span className={`faq-pct ${faq.pct_answered_clearly >= 50 ? 'good' : 'bad'}`}>
            {faq.pct_answered_clearly}% clear
          </span>
        </div>
      </button>
      <StatusBar counts={faq.status_counts} />
      {open && (
        <div className="faq-body">
          <div className="faq-regions">
            {Object.entries(faq.by_region).sort((a, b) => b[1] - a[1]).map(([r, n]) => (
              <span key={r} className="region-chip">{r} · {n}</span>
            ))}
          </div>
          {faq.best_answer && (
            <div className="best-answer">
              <div className="block-label">Best answer on record — {faq.best_answer.agent}</div>
              {faq.best_answer.quote
                ? <blockquote>“{faq.best_answer.quote}”</blockquote>
                : <p>{faq.best_answer.summary}</p>}
            </div>
          )}
          {faq.examples?.length > 0 && (
            <div className="examples">
              <div className="block-label">Examples</div>
              {faq.examples.map((e, i) => (
                <div key={i} className="example-row">
                  <span className={`status-pill pill-${e.status}`}>{STATUS_LABELS[e.status]}</span>
                  <span className="example-text">
                    {e.customer_quote ? <>“{e.customer_quote}”</> : <em>(no verbatim quote)</em>}
                    <span className="example-meta"> — {e.region}, {e.agent}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FaqsPage() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('faqs');
  const [regionFilter, setRegionFilter] = useState('All');
  const [topicFilter, setTopicFilter] = useState('All');

  useEffect(() => {
    fetch('/api/faqs')
      .then(async r => {
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error || `Request failed (${r.status})`);
        return json;
      })
      .then(json => { setData(json); setStatus('ready'); })
      .catch(e => { setError(e.message); setStatus('error'); });
  }, []);

  const regions = useMemo(() =>
    data ? data.regions.filter(r => r.region !== 'Unknown').map(r => r.region) : [],
    [data]);

  const visibleFaqs = useMemo(() => {
    if (!data) return [];
    let fs = data.faqs;
    if (regionFilter !== 'All') fs = fs.filter(f => (f.by_region[regionFilter] || 0) > 0);
    if (topicFilter !== 'All') fs = fs.filter(f => f.topic === topicFilter);
    if (regionFilter !== 'All') {
      fs = [...fs].sort((a, b) => (b.by_region[regionFilter] || 0) - (a.by_region[regionFilter] || 0));
    }
    return fs;
  }, [data, regionFilter, topicFilter]);

  if (status === 'loading') {
    return <main className="faqs-main"><div className="state-box">Loading FAQ analysis…</div></main>;
  }
  if (status === 'error') {
    return (
      <main className="faqs-main">
        <div className="state-box">
          <strong>Couldn&apos;t load FAQ analysis.</strong>
          <div className="error-detail">{error}</div>
        </div>
      </main>
    );
  }

  const topics = [...new Set(data.faqs.map(f => f.topic))];
  const answeredWell = data.faqs.filter(f => f.total_asks >= 2 && f.pct_answered_clearly >= 50);

  return (
    <main className="faqs-main">
      <div className="faqs-header">
        <div>
          <h1 className="title-header">Customer FAQs</h1>
          <p className="subtitle">
            What customers ask on calls, how well it gets answered, and what to train on —
            from {data.calls_with_questions} of {data.calls_analyzed} analysed calls
            ({data.total_questions} questions)
          </p>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-box">
          <span className="stat-label">Questions asked</span>
          <span className="stat-value">{data.total_questions}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Distinct FAQs</span>
          <span className="stat-value">{data.faqs.length}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Answered well</span>
          <span className="stat-value">{answeredWell.length}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Need clarification</span>
          <span className="stat-value warn">{data.needs_clarification.length}</span>
        </div>
      </div>

      <div className="tab-row">
        <button className={`tab ${tab === 'faqs' ? 'active' : ''}`} onClick={() => setTab('faqs')}>
          All FAQs
        </button>
        <button className={`tab ${tab === 'regions' ? 'active' : ''}`} onClick={() => setTab('regions')}>
          By Region
        </button>
        <button className={`tab ${tab === 'clarify' ? 'active' : ''}`} onClick={() => setTab('clarify')}>
          Needs Clarification
          <span className="tab-badge">{data.needs_clarification.length}</span>
        </button>
      </div>

      {tab === 'faqs' && (
        <>
          <div className="filter-row">
            <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)}>
              <option>All</option>
              {regions.map(r => <option key={r}>{r}</option>)}
            </select>
            <select value={topicFilter} onChange={e => setTopicFilter(e.target.value)}>
              <option>All</option>
              {topics.map(t => <option key={t} value={t}>{TOPIC_LABELS[t] || t}</option>)}
            </select>
            <div className="legend">
              {STATUS_ORDER.map(s => (
                <span key={s} className="legend-item">
                  <span className={`legend-dot seg-${s}`} /> {STATUS_LABELS[s]}
                </span>
              ))}
            </div>
          </div>
          <div className="faq-list">
            {visibleFaqs.map(f => <FaqCard key={f.id} faq={f} />)}
          </div>
        </>
      )}

      {tab === 'regions' && (
        <div className="region-grid">
          {data.region_insights.map(ri => (
            <div key={ri.region} className="region-card">
              <div className="region-card-head">
                <h3>{ri.region}</h3>
                <span className="region-count">{ri.questions} questions · {ri.calls} calls</span>
              </div>
              {ri.distinctive_faqs.length === 0 ? (
                <p className="muted">Asks the same things as everywhere else — no distinctive questions yet.</p>
              ) : (
                <>
                  <div className="block-label">Asked here far more than elsewhere</div>
                  {ri.distinctive_faqs.map(d => (
                    <div key={d.faq_id} className="distinct-row">
                      <span className="lift">{d.lift}×</span>
                      <span>{d.canonical_question}
                        <span className="example-meta"> · {d.asks_in_region} asks</span>
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'clarify' && (
        <div className="clarify-list">
          <p className="clarify-intro">
            Questions customers keep asking that agents couldn&apos;t answer clearly.
            Suggested answers marked <span className="pill-grounded">from real calls</span> are
            built only from answers agents actually gave; those marked
            <span className="pill-ungrounded"> needs facts</span> contain
            [CONFIRM: …] gaps the business must fill before training on them.
          </p>
          {data.needs_clarification.map(n => (
            <div key={n.faq_id} className="clarify-card">
              <div className="clarify-head">
                <div className="faq-q">
                  <span className="faq-topic">{TOPIC_LABELS[n.topic] || n.topic}</span>
                  {n.canonical_question}
                </div>
                <div className="faq-meta">
                  <span className="faq-asks">{n.total_asks}×</span>
                  <span className="faq-pct bad">{n.pct_answered_clearly}% clear</span>
                </div>
              </div>
              <div className="clarify-why">{n.why}</div>
              <div className="faq-regions">
                {Object.entries(n.by_region).sort((a, b) => b[1] - a[1]).map(([r, c]) => (
                  <span key={r} className="region-chip">{r} · {c}</span>
                ))}
              </div>
              {n.suggested_answer && (
                <div className="suggested-answer">
                  <div className="block-label">
                    Suggested answer
                    <span className={n.grounded_in_calls ? 'pill-grounded' : 'pill-ungrounded'}>
                      {n.grounded_in_calls ? 'from real calls' : 'needs facts'}
                    </span>
                  </div>
                  <p>{n.suggested_answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="generated-note">
        Generated {new Date(data.generated_at).toLocaleString()} · model {data.model}
      </p>
    </main>
  );
}
