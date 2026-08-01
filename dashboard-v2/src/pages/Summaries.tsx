import { useNavigate } from 'react-router-dom';
import { PageHead } from '../components/layout';
import { Card, Loading, ErrorState, DataTable, Pill, Prov, exportCsv, sentimentTone, type Column } from '../components/ui';
import { ScopeBanner, scopeNote } from '../components/ScopeBanner';
import { useFilteredData } from '../state/useData';
import { useAppState } from '../state/AppState';
import { fmtDateTime, fmtDuration, fmtInt } from '../lib/format';
import { EMPLOYEES } from '../data/taxonomy';
import type { CallRecord } from '../types/domain';

/**
 * Read-the-summaries view: the whole period as scannable prose, so a manager can
 * catch up on what was actually said without opening each call. Call Explorer
 * answers "which calls match these criteria"; this answers "what happened".
 */
export default function Summaries() {
  const { data: d, loading, error } = useFilteredData();
  const { filters, setFilters } = useAppState();
  const navigate = useNavigate();

  if (loading && !d) return <Loading label="Loading call summaries…" />;
  if (error) return <ErrorState message={error} />;
  if (!d) return null;

  // Only calls that actually produced a summary — a row with no text would be
  // noise on a page whose entire purpose is the text.
  const rows = d.current.filter((c) => (c.summary ?? '').trim().length > 0);
  const withNextStep = rows.filter((c) => c.actions.length > 0).length;

  const cols: Column<CallRecord>[] = [
    {
      key: 'when', label: 'Call', render: (c) => (
        <div style={{ minWidth: 132 }}>
          <strong style={{ fontSize: 12.5 }}>{fmtDateTime(c.dateTime)}</strong>
          <div className="cell-sub">{c.direction} · {fmtDuration(c.durationSec)}</div>
          <div className="cell-sub">{c.id}</div>
        </div>
      ), sortVal: (c) => c.dateTime,
    },
    {
      key: 'customer', label: 'Customer / agent', render: (c) => {
        const e = EMPLOYEES.find((x) => x.id === c.employeeId);
        return (
          <div style={{ maxWidth: 170 }}>
            <span style={{ overflowWrap: 'anywhere', fontWeight: 550 }}>{c.customerName}</span>
            <div className="cell-sub">{c.city !== 'Not specified' ? c.city : c.region}</div>
            <div className="cell-sub">{e?.name ?? c.employeeId}</div>
          </div>
        );
      }, sortVal: (c) => c.customerName,
    },
    {
      key: 'summary', label: 'Summary', render: (c) => (
        <div style={{ minWidth: 320, maxWidth: 620, fontSize: 12.5, lineHeight: 1.5 }}>
          {c.summary}
          {c.actions.length > 0 && (
            <div className="cell-sub" style={{ marginTop: 4 }}>
              Next: {c.actions.slice(0, 2).map((a) => a.action).join(' · ')}
              {c.actions.length > 2 && ` +${c.actions.length - 2} more`}
            </div>
          )}
        </div>
      ), sortVal: (c) => c.summary.length,
    },
    {
      key: 'sent', label: 'Sentiment', render: (c) => c.sentiment
        ? <Pill tone={sentimentTone(c.sentiment.overall)}>{c.sentiment.overall}</Pill>
        : <span className="cell-sub">not analysed</span>,
      sortVal: (c) => c.sentiment?.overall ?? 'zz',
    },
    {
      key: 'outcome', label: 'Outcome', render: (c) => (
        <div style={{ maxWidth: 140, fontSize: 12 }}>{c.outcome}</div>
      ), sortVal: (c) => c.outcome,
    },
  ];

  return (
    <>
      <PageHead title="Call Summaries"
        desc="A plain-language recap of every call in the period, generated from the real transcript. Sort or search to catch up quickly; click any row for the full transcript and evidence."
        periodNote={scopeNote(d, filters.preset)} />
      <ScopeBanner d={d} />

      <Card>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <input className="searchbox" style={{ minWidth: 300 }}
            placeholder="Search inside summaries — e.g. “wardrobe”, “dealership”, a customer name…"
            value={filters.search} onChange={(e) => setFilters({ search: e.target.value })}
            aria-label="Search summaries" />
          <span className="sample-note">
            {fmtInt(rows.length)} summaries <Prov k="call.summary" /> · {fmtInt(withNextStep)} with a next step
          </span>
          <button className="btn small" style={{ marginLeft: 'auto' }} onClick={() => exportCsv('call-summaries.csv',
            ['Call ID', 'Date', 'Customer', 'Agent', 'City', 'Direction', 'Duration (s)', 'Sentiment', 'Outcome', 'Summary', 'Next actions'],
            rows.map((c) => [
              c.id, c.dateTime, c.customerName,
              EMPLOYEES.find((e) => e.id === c.employeeId)?.name ?? c.employeeId,
              c.city, c.direction, c.durationSec,
              c.sentiment?.overall ?? 'not analysed', c.outcome, c.summary,
              c.actions.map((a) => a.action).join('; '),
            ]))}>
            Export CSV
          </button>
        </div>
        <DataTable columns={cols} rows={rows} rowKey={(c) => c.id} pageSize={12}
          initialSort={{ key: 'when', dir: 'desc' }}
          onRow={(c) => navigate(`/calls/${c.id}`)}
          emptyMessage="No summarised calls match the current filters. Try widening the period or clearing the search." />
      </Card>
    </>
  );
}
