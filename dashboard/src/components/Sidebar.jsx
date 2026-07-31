'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './Sidebar.css';

export default function Sidebar() {
  const pathname = usePathname();
  const isActive = (href) => href === '/' ? pathname === '/' : pathname.startsWith(href);

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
        <Link href="/" className={`nav-item ${isActive('/') ? 'active' : ''}`}>
          <span className="icon">㗊</span> Dashboard
        </Link>
        <Link href="/calls" className={`nav-item ${isActive('/calls') ? 'active' : ''}`}>
          <span className="icon">📞</span> Call Recordings
        </Link>
        <Link href="#" className="nav-item">
          <span className="icon">📳</span> Dialer
        </Link>
        <Link href="#" className="nav-item">
          <span className="icon">👥</span> Team Performance
        </Link>
        <Link href="/analytics" className={`nav-item ${isActive('/analytics') ? 'active' : ''}`}>
          <span className="icon">📊</span> Analytics
        </Link>
        <Link href="/regions" className={`nav-item ${isActive('/regions') ? 'active' : ''}`}>
          <span className="icon">📍</span> Regions
        </Link>
        <Link href="/faqs" className={`nav-item ${isActive('/faqs') ? 'active' : ''}`}>
          <span className="icon">❓</span> FAQs
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
