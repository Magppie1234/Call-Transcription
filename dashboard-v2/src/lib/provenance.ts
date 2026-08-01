/**
 * Feature-level data provenance.
 *
 * Every insight surface declares where its numbers come from, so the UI can be
 * honest about what is real Magppie data and what is still demo content:
 *
 *   real    — computed from live Zoho calls + Sarvam transcripts + LLM extraction
 *   partial — real data, but a named part of the feature has no source yet
 *   demo    — no real source exists; the mock generator still supplies this
 *
 * Keep this list in sync with what the pages render. `note` is shown on hover
 * and in the Data Quality page's coverage table.
 */
export type ProvStatus = 'real' | 'partial' | 'demo';

export interface ProvEntry {
  status: ProvStatus;
  note: string;
}

export const PROVENANCE: Record<string, ProvEntry> = {
  // ── Volumes & coverage ────────────────────────────────────────────────
  'kpi.volume': { status: 'real', note: 'Call count, duration and direction from Zoho CRM Calls.' },
  'kpi.coverage': { status: 'real', note: 'Transcription coverage: Sarvam Saaras v3 transcripts stored per call.' },
  'kpi.customers': { status: 'real', note: 'Unique customers from the Zoho Lead/Contact linked to each call.' },
  'kpi.meaningful': { status: 'real', note: 'Connected, longer than 60s, and the customer actually spoke (from diarisation).' },

  // ── Sentiment & voice of customer ─────────────────────────────────────
  'sentiment.overall': { status: 'real', note: 'Text-based sentiment extracted per call by gpt-4.1-mini from the real transcript.' },
  'sentiment.journey': { status: 'real', note: 'Opening/mid/closing scored separately on each real transcript; shift = closing − opening.' },
  'sentiment.emotions': { status: 'real', note: 'Emotions detected from transcript wording only — no voice-tone analysis.' },
  'voc.themes': { status: 'real', note: 'Appreciation, dissatisfaction, expectations and pain points extracted from real transcripts.' },
  'voc.featureRequests': { status: 'real', note: 'Feature requests extracted from real customer speech.' },

  // ── FAQs ──────────────────────────────────────────────────────────────
  'faq.questions': { status: 'real', note: 'Real customer questions — each one kept only when a verbatim transcript quote could be verified.' },
  'faq.answerQuality': { status: 'real', note: 'Answered / partial / unanswered judged against what the agent actually said.' },
  'faq.responseTime': { status: 'real', note: 'Measured from Sarvam word timestamps: question end → agent’s next turn.' },
  'faq.category': { status: 'partial', note: 'Real questions, but mapped onto this dashboard’s fixed 16-category taxonomy — “showroom visit” and “company info” have no exact bucket and land on the nearest one.' },
  'faq.accuracy': { status: 'demo', note: 'Answer *correctness* cannot be assessed: Magppie has no approved knowledge base to check answers against. Only relevance and completeness are measured.' },

  // ── Regional ──────────────────────────────────────────────────────────
  'region.geo': { status: 'partial', note: 'City/state resolved from the linked Zoho Lead. 598 of 723 calls have a city; the rest show as Unknown.' },
  'region.pincode': { status: 'demo', note: 'Zoho’s Zip_Code field is empty on every lead in this dataset, so pincode-level analysis has no real source.' },

  // ── Sales & objections ────────────────────────────────────────────────
  'sales.readiness': { status: 'real', note: 'Purchase-readiness sub-scores extracted per call, weighted per the documented methodology.' },
  'sales.objections': { status: 'real', note: 'Objections detected in the transcript, classified into the dashboard taxonomy with the customer’s own words as evidence.' },
  'sales.competitors': { status: 'real', note: 'Competitor names mentioned by the customer on the call.' },
  'sales.budget': { status: 'real', note: 'Budget and timeline only when the customer actually stated them; never inferred.' },
  'sales.revenue': { status: 'demo', note: 'No Deal records are linked to these calls and no CRM stage marks a won order, so influenced revenue and order counts have no real source.' },
  'sales.funnelCrm': { status: 'partial', note: 'Opportunity stage is real (Zoho “Qualified/Drawings Awaited”); the order-confirmed stage does not exist in this CRM data.' },

  // ── Agent quality ─────────────────────────────────────────────────────
  'agent.quality': { status: 'real', note: 'Eight-parameter scorecard built from the real per-call scorecard plus transcript-derived dimensions.' },
  'agent.talk': { status: 'real', note: 'Talk ratio from diarisation; interruptions and longest silence measured from real Sarvam timestamps.' },
  'agent.coaching': { status: 'real', note: 'Coaching notes generated per call from what the agent actually did.' },
  'agent.compliance': { status: 'real', note: 'Compliance flags raised only where a breach is observable in the transcript. Across all 722 calls the extraction found none, so these counters legitimately read zero — the check ran, it did not fail to run.' },
  'agent.team': { status: 'demo', note: 'Agent names are real (Zoho call owners), but team and reporting manager are not available — the Users module is outside our OAuth scope.' },

  // ── Actions ───────────────────────────────────────────────────────────
  'actions.list': { status: 'real', note: 'Next actions derived from commitments actually made on the call — the reason text is what the agent or customer said they would do.' },
  'actions.sla': { status: 'partial', note: 'Due dates come from the real call time plus a priority-based SLA. Because no system reports completion back, every action whose date has passed counts as overdue — treat the overdue total as “not confirmed done”, not as proven failure.' },
  'actions.crmSync': { status: 'demo', note: 'No task-system integration exists, so CRM task linkage and completed-vs-open status cannot be real. Every action starts as pending.' },

  // ── Calls & transcripts ───────────────────────────────────────────────
  'call.transcript': { status: 'real', note: 'Full diarised Sarvam transcript with real per-turn timestamps.' },
  'call.summary': { status: 'real', note: 'Per-call summary generated from the real transcript.' },
  'call.audio': { status: 'demo', note: 'Recording playback is not wired into this app; audio lives behind a Zoho session cookie in the other dashboard.' },
  'call.entities': { status: 'real', note: 'People, places, products, money and dates extracted from the real transcript.' },

  // ── Alerts ────────────────────────────────────────────────────────────
  'alerts.rules': { status: 'real', note: 'Alert rules evaluated against real calls (negative sentiment, unanswered questions, overdue actions, compliance).' },
  'alerts.workflow': { status: 'demo', note: 'Acknowledging or resolving an alert is in-app only — there is no escalation system to write back to.' },

  // ── Period handling ───────────────────────────────────────────────────
  'period.comparison': { status: 'demo', note: 'The dataset is a single 24-day window (1–24 July 2026), so the previous-period comparison is empty and every delta reads “no prior data”. Trend-vs-last-period needs a longer transcription history.' },
  'period.anchor': { status: 'partial', note: 'Period filters run relative to the snapshot end date (25 July 2026) rather than today, so “last 7/30 days” stay meaningful as the snapshot ages.' },

  // ── Misc dimensions ───────────────────────────────────────────────────
  'dim.leadSource': { status: 'real', note: 'Lead source from the Zoho Lead record (95% populated).' },
  'dim.campaign': { status: 'real', note: 'Campaign name from the Zoho Lead record (77% populated).' },
  'dim.crmStage': { status: 'real', note: 'Lead status from Zoho (87% populated).' },
  'dim.customerType': { status: 'real', note: 'From Zoho client type (End User / Paid / Architect / Interior Designer), falling back to transcript evidence.' },
  'dim.product': { status: 'partial', note: 'Zoho’s product-requirement field is empty on ~99% of leads, so the product shown is whatever range the customer named on the call.' },
  'dim.language': { status: 'real', note: 'Language mix detected per call during transcription.' },
};

export const provOf = (key: string): ProvEntry | null => PROVENANCE[key] ?? null;

export function provCounts() {
  const vals = Object.values(PROVENANCE);
  return {
    real: vals.filter((v) => v.status === 'real').length,
    partial: vals.filter((v) => v.status === 'partial').length,
    demo: vals.filter((v) => v.status === 'demo').length,
    total: vals.length,
  };
}
