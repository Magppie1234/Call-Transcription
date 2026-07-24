import Link from 'next/link';
import './Sidebar.css';

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo-icon">🎧</div>
        <div className="logo-text">
          <h1>Magppie</h1>
          <span>CALL INTELLIGENCE</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <Link href="/" className="nav-item">
          <span className="icon">㗊</span> Dashboard
        </Link>
        <Link href="/calls" className="nav-item active">
          <span className="icon">📞</span> Call Recordings
        </Link>
        <Link href="#" className="nav-item">
          <span className="icon">📳</span> Dialer
        </Link>
        <Link href="#" className="nav-item">
          <span className="icon">👥</span> Team Performance
        </Link>
        <Link href="#" className="nav-item">
          <span className="icon">📊</span> Analytics
        </Link>
        <Link href="#" className="nav-item">
          <span className="icon">🔌</span> Integrations
        </Link>
      </nav>

      <div className="sidebar-footer">
        <div className="status-item">
          <div className="status-label">
            <span className="status-dot"></span> Zoho CRM
          </div>
          <span className="status-badge">Connected</span>
        </div>
        <div className="status-item">
          <div className="status-label">
            <span className="status-dot"></span> Ozonetel CloudAgent
          </div>
          <span className="status-badge">Connected</span>
        </div>
      </div>
    </aside>
  );
}
