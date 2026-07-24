import Link from 'next/link';
import './page.css';

export default async function Dashboard() {
  return (
    <main className="dashboard-main">
      <div className="dashboard-header">
        <div className="title-section">
          <h1 className="title-header">Dashboard Overview</h1>
          <p className="subtitle">Welcome back, here's what's happening today.</p>
        </div>
      </div>
      
      <div className="dashboard-content">
        <div className="metrics-grid">
          <div className="metric-card">
            <h3>Total Calls</h3>
            <div className="metric-val">1,248</div>
            <div className="metric-trend positive">↑ 12% vs last week</div>
          </div>
          <div className="metric-card">
            <h3>Avg AI Score</h3>
            <div className="metric-val">8.4</div>
            <div className="metric-trend positive">↑ 2% vs last week</div>
          </div>
          <div className="metric-card">
            <h3>Avg Duration</h3>
            <div className="metric-val">4m 12s</div>
            <div className="metric-trend neutral">- vs last week</div>
          </div>
        </div>
        
        <div className="quick-actions">
          <Link href="/calls" className="btn-primary">
            View All Call Recordings
          </Link>
        </div>
      </div>
    </main>
  );
}
