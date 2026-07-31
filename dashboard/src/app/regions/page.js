'use client';
import { useState, useEffect } from 'react';
import './regions.css';

export default function RegionsPage() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/regions')
      .then(async r => {
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error || `Request failed (${r.status})`);
        return json;
      })
      .then(json => { setData(json); setStatus('ready'); })
      .catch(e => { setError(e.message); setStatus('error'); });
  }, []);

  if (status === 'loading') {
    return <main className="regions-main"><div className="state-box">Loading caller locations…</div></main>;
  }

  if (status === 'error') {
    return (
      <main className="regions-main">
        <div className="state-box">
          <strong>Couldn&apos;t load locations.</strong>
          <div className="error-detail">{error}</div>
        </div>
      </main>
    );
  }

  const { totalCalls, withState, withCity, states, cities } = data;
  const maxCity = cities[0]?.calls || 1;
  const maxState = states[0]?.calls || 1;

  return (
    <main className="regions-main">
      <div className="regions-header">
        <div>
          <h1 className="title-header">Caller Regions</h1>
          <p className="subtitle">
            Where callers are located, from their linked Zoho Lead/Contact record
          </p>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-box">
          <span className="stat-label">Total Calls</span>
          <span className="stat-value">{totalCalls}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">With City</span>
          <span className="stat-value">
            {withCity}
            <small>/ {totalCalls}</small>
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">With State</span>
          <span className="stat-value">
            {withState}
            <small>/ {totalCalls}</small>
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Distinct Cities</span>
          <span className="stat-value">{cities.length}</span>
        </div>
      </div>

      <div className="regions-grid">
        <section className="region-panel">
          <div className="panel-head">
            <h2 className="panel-title">States</h2>
            <span className="panel-count">{states.length} listed</span>
          </div>
          {states.length === 0 ? (
            <p className="panel-empty">
              No state recorded on any call. Zoho&apos;s State field is rarely filled
              in — city is the reliable location signal.
            </p>
          ) : (
            <>
              <p className="panel-note">
                Only {withState} of {totalCalls} calls have a state on the CRM record.
              </p>
              <ul className="region-list">
                {states.map(s => (
                  <li key={s.name} className="region-row">
                    <span className="region-name">{s.name}</span>
                    <span className="region-bar-wrap">
                      <span className="region-bar" style={{ width: `${(s.calls / maxState) * 100}%` }} />
                    </span>
                    <span className="region-count">{s.calls}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="region-panel">
          <div className="panel-head">
            <h2 className="panel-title">Cities</h2>
            <span className="panel-count">{cities.length} listed</span>
          </div>
          <p className="panel-note">
            Free-text in Zoho, so spellings vary and some entries are actually states.
          </p>
          <ul className="region-list">
            {cities.map(c => (
              <li key={c.name} className="region-row">
                <span className="region-name">{c.name}</span>
                <span className="region-bar-wrap">
                  <span className="region-bar" style={{ width: `${(c.calls / maxCity) * 100}%` }} />
                </span>
                <span className="region-count">{c.calls}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
