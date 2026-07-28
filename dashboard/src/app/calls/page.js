'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import './calls.css';
import './extra.css';

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const date = d.toISOString().slice(0, 10);
  const time = d.toTimeString().slice(0, 5);
  return { date, time };
}

export default function CallsPage() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');

  // Show why the list is empty. A failed request rendered as "No calls found"
  // is indistinguishable from genuinely having no calls, which hides real
  // problems like missing environment variables in a deployment.
  const load = () => {
    setLoading(true);
    setError(null);
    fetch('/api/calls')
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || `Request failed (${r.status})`);
        return data;
      })
      .then(data => {
        setCalls(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const filtered = calls.filter(c => {
    const matchFilter =
      filter === 'All' ||
      (filter === 'Inbound' && c.callType === 'Inbound') ||
      (filter === 'Outbound' && c.callType === 'Outbound');

    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      c.customer.name.toLowerCase().includes(q) ||
      c.agent.toLowerCase().includes(q) ||
      c.customer.phone.includes(q);

    return matchFilter && matchSearch;
  });

  return (
    <main className="calls-main">
      <div className="calls-header-section">
        <div>
          <h1 className="title-header">Call Recordings</h1>
          <p className="subtitle">Live from Zoho CRM · {calls.length} recordings found</p>
        </div>
        <button className="btn-dark" onClick={load}>
          ↻ Refresh
        </button>
      </div>

      <div className="filters-bar">
        <div className="search-box">
          <span className="icon">🔍</span>
          <input
            type="text"
            placeholder="Search customer, agent, phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="pill-group">
          {['All', 'Inbound', 'Outbound'].map(f => (
            <button key={f} className={`pill ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="table-container">
        {error ? (
          <div className="loading-state">
            <strong>Couldn&apos;t load calls.</strong>
            <div className="error-detail">{error}</div>
            <div className="error-hint">
              If this is a deployment, check that the Zoho and Supabase environment
              variables are set for this environment.
            </div>
          </div>
        ) : loading ? (
          <div className="loading-state">Loading calls from Zoho CRM…</div>
        ) : filtered.length === 0 ? (
          <div className="loading-state">No calls found.</div>
        ) : (
          <table className="calls-table">
            <thead>
              <tr>
                <th>CUSTOMER</th>
                <th>AGENT</th>
                <th>DATE & TIME</th>
                <th>DURATION</th>
                <th>TYPE</th>
                <th>TRANSCRIPT</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(call => {
                const { date, time } = formatDate(call.startTime);
                return (
                  <tr key={call.id} className="table-row">
                    <td>
                      <div className="customer-cell">
                        <div className={`call-icon ${call.callType === 'Inbound' ? 'inbound' : 'outbound'}`}>
                          {call.callType === 'Inbound' ? '📲' : '📞'}
                        </div>
                        <div>
                          <div className="customer-name">
                            {call.hasSummary && <span className="dot dot-summarized" title="Summarized" />}
                            {call.customer.name}
                          </div>
                          <div className="customer-meta">{call.customer.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td className="agent-cell">{call.agent}</td>
                    <td className="date-cell">
                      <span>{date}</span>
                      <span className="time-badge">{time}</span>
                    </td>
                    <td className="duration-cell">{call.duration}</td>
                    <td>
                      <span className={`type-pill ${call.callType === 'Inbound' ? 'type-inbound' : 'type-outbound'}`}>
                        {call.callType}
                      </span>
                    </td>
                    <td>
                      {call.hasTranscript ? (
                        <span className="transcript-badge">✨ Transcribed</span>
                      ) : (
                        <span className="no-transcript-badge">—</span>
                      )}
                    </td>
                    <td>
                      <Link href={`/calls/${call.id}`} className="view-btn" title="Open transcript & recording page">
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
    </main>
  );
}
