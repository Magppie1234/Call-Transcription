'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import './detail.css';

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return {
    date: d.toISOString().slice(0, 10),
    time: d.toTimeString().slice(0, 5),
  };
}

function formatSeconds(s) {
  if (!s) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function CallDetailPage({ params }) {
  const [callId, setCallId] = useState(null);
  const [callMeta, setCallMeta] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [transcriptStatus, setTranscriptStatus] = useState('loading');
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);

  // Resolve async params
  useEffect(() => {
    Promise.resolve(params).then(p => setCallId(p.id));
  }, [params]);

  // Fetch call metadata: first try the single-call endpoint
  useEffect(() => {
    if (!callId) return;
    fetch(`/api/calls?callId=${callId}`)
      .then(r => r.json())
      .then(data => {
        // The API returns a single object when callId is provided
        setCallMeta(data?.id ? data : null);
      })
      .catch(() => setCallMeta(null));
  }, [callId]);

  // Fetch transcript
  useEffect(() => {
    if (!callId) return;
    fetch(`/api/transcript?callId=${callId}`)
      .then(r => {
        if (r.status === 404) { setTranscriptStatus('not_found'); return null; }
        return r.json();
      })
      .then(data => {
        if (data) {
          setTranscript(data.transcript);
          setTranscriptStatus('ready');
        }
      })
      .catch(() => setTranscriptStatus('error'));
  }, [callId]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) { audio.pause(); } else { audio.play(); }
    setIsPlaying(!isPlaying);
  };

  const onTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    setAudioProgress((audio.currentTime / audio.duration) * 100);
  };

  const onSeek = (e) => {
    const audio = audioRef.current;
    if (!audio) return;
    const pct = Number(e.target.value);
    audio.currentTime = (pct / 100) * audio.duration;
    setAudioProgress(pct);
  };

  if (!callId || !callMeta) {
    return (
      <main className="detail-main">
        <Link href="/calls" className="back-link">← Back to Calls</Link>
        <div className="loading-msg">Loading call details…</div>
      </main>
    );
  }

  const { date, time } = formatDate(callMeta.startTime);
  const audioProxyUrl = callMeta.recordingUrl
    ? `/api/audio?url=${encodeURIComponent(callMeta.recordingUrl)}`
    : null;

  const entries = transcript?.diarized_transcript?.entries || [];

  // Auto-detect which speaker_id is the Magppie agent.
  // Sarvam diarization is inconsistent — agent can be "0", "1", or "2".
  // Strongest signal: the agent introduces themselves as calling from Magppie,
  // so the speaker who says the company name is the agent.
  // Fallbacks: first long utterance (the greeting/intro), then most lines.
  const agentSpeakerId = (() => {
    if (!entries.length) return '0';
    // The company name (and its common mistranscriptions) marks the agent.
    const companyRe = /\bmag+p+ie|magpp?ie|mac ?pie|magpai|magpy\b/i;
    const brandEntry = entries.find(e => companyRe.test(e.transcript || ''));
    if (brandEntry) return brandEntry.speaker_id;
    // Otherwise: first speaker who says something longer than 20 characters
    const longEntry = entries.find(e => e.transcript && e.transcript.trim().length > 20);
    if (longEntry) return longEntry.speaker_id;
    // Fallback: speaker with most lines
    const counts = {};
    entries.forEach(e => { counts[e.speaker_id] = (counts[e.speaker_id] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '0';
  })();

  const agentName = callMeta.agent;
  const customerName = callMeta.customer.name;

  return (
    <main className="detail-main">
      <Link href="/calls" className="back-link">← Back to Calls</Link>

      {/* Header Card */}
      <div className="header-card">
        <div className="header-card-top">
          <div className="customer-info">
            <div className={`call-icon-lg ${callMeta.callType === 'Inbound' ? 'inbound' : 'outbound'}`}>
              {callMeta.callType === 'Inbound' ? '📲' : '📞'}
            </div>
            <div>
              <div className="customer-title">
                <h2>{callMeta.customer.name}</h2>
                <span className={`type-pill ${callMeta.callType === 'Inbound' ? 'type-inbound' : 'type-outbound'}`}>
                  {callMeta.callType}
                </span>
              </div>
              <div className="customer-subtitle">
                {callMeta.customer.phone} · {callMeta.agent} · {date} at {time} · {callMeta.duration}
              </div>
            </div>
          </div>
        </div>

        {/* Audio Player */}
        {audioProxyUrl && (
          <div className="audio-player">
            <audio
              ref={audioRef}
              src={audioProxyUrl}
              onTimeUpdate={onTimeUpdate}
              onLoadedMetadata={() => setAudioDuration(audioRef.current?.duration || 0)}
              onEnded={() => setIsPlaying(false)}
            />
            <button className="play-circle-btn" onClick={togglePlay}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <div className="progress-bar-container">
              <input
                type="range"
                className="progress-slider"
                min={0}
                max={100}
                value={audioProgress}
                onChange={onSeek}
              />
              <div className="time-stamps">
                <span>{formatSeconds(audioRef.current?.currentTime)}</span>
                <span className="audio-url">{callMeta.recordingUrl}</span>
                <span>{callMeta.duration}</span>
              </div>
            </div>
            <a href={audioProxyUrl} download className="download-btn" title="Download recording">⬇</a>
          </div>
        )}
      </div>

      {/* Body Grid */}
      <div className="content-grid">
        {/* Transcript */}
        <div className="transcript-section">
          <h3 className="section-title">✨ AI Transcript</h3>

          {transcriptStatus === 'loading' && <div className="transcript-msg">Loading transcript…</div>}
          {transcriptStatus === 'not_found' && (
            <div className="transcript-msg">
              No transcript yet for this call.<br />
              <span className="muted-text">Run the transcription script to generate one.</span>
            </div>
          )}
          {transcriptStatus === 'error' && <div className="transcript-msg">Error loading transcript.</div>}

          {transcriptStatus === 'ready' && entries.length === 0 && (
            <div className="transcript-msg">No speech detected in this recording.</div>
          )}

          {transcriptStatus === 'ready' && entries.length > 0 && (
            <div className="chat-container">
              {entries.map((entry, idx) => {
                const isAgent = entry.speaker_id === agentSpeakerId;
                const speakerName = isAgent ? agentName : customerName;
                const avatarLetter = speakerName ? speakerName.charAt(0).toUpperCase() : '?';
                // Magppie's agent on the right, customer on the left
                const align = isAgent ? 'right' : 'left';
                const avatarClass = isAgent ? 'agent-avatar' : 'customer-avatar';

                return (
                  <div key={idx} className={`chat-bubble-wrapper ${align}`}>
                    {align === 'left' && (
                      <div className={`avatar ${avatarClass}`} title={speakerName}>{avatarLetter}</div>
                    )}
                    <div className="chat-content">
                      <div className="chat-meta">
                        {speakerName} · {formatSeconds(entry.start_time_seconds)}
                      </div>
                      <div className={`chat-bubble ${align}`}>{entry.transcript}</div>
                    </div>
                    {align === 'right' && (
                      <div className={`avatar ${avatarClass}`} title={speakerName}>{avatarLetter}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="sidebar-section">
          <div className="info-card">
            <h4>Call Details</h4>
            <div className="info-row"><span>Customer</span><span>{callMeta.customer.name}</span></div>
            <div className="info-row"><span>Phone</span><span>{callMeta.customer.phone}</span></div>
            <div className="info-row"><span>Agent</span><span>{callMeta.agent}</span></div>
            <div className="info-row"><span>Date</span><span>{date} {time}</span></div>
            <div className="info-row"><span>Duration</span><span>{callMeta.duration}</span></div>
            <div className="info-row"><span>Type</span><span>{callMeta.callType}</span></div>
          </div>
        </div>
      </div>
    </main>
  );
}
