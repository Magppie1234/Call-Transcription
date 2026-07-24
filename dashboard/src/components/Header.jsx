import './Header.css';

export default function Header() {
  return (
    <header className="header">
      <div className="search-container">
        <span className="search-icon">🔍</span>
        <input 
          type="text" 
          placeholder="Search calls, customers, transcripts..." 
          className="search-input"
        />
      </div>
      
      <div className="header-actions">
        <button className="notification-btn">
          <span>🔔</span>
        </button>
        
        <div className="user-profile">
          <div className="avatar">NS</div>
          <div className="user-info">
            <span className="user-name">Nitya Sharma</span>
            <span className="user-role">Founder's Office</span>
          </div>
        </div>
      </div>
    </header>
  );
}
