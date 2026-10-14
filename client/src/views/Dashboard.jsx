import { useState } from 'react';
import { useAuth } from '../state/AuthContext.jsx';
import { useSocket } from '../state/SocketContext.jsx';
import DirectConversation from '../components/DirectConversation.jsx';

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const { connectionState } = useSocket();
  const [activeTab, setActiveTab] = useState('messages');
  const [activePeer, setActivePeer] = useState(null);

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <header className="sidebar-header">
          <div className="brand-lockup"><span className="brand-mark small">C</span><span>ChatSphere</span></div>
          <button className="icon-button" aria-label="More options">···</button>
        </header>
        <div className="profile-row">
          <div className="avatar avatar-self">{(user?.username || '?').slice(0, 1).toUpperCase()}</div>
          <div className="profile-copy"><strong>{user?.username}</strong><span><i className="presence-dot" /> Available</span></div>
          <button className="text-button" onClick={signOut}>Sign out</button>
        </div>
        <div className="search-wrap"><span aria-hidden="true">⌕</span><input aria-label="Search conversations" placeholder="Search conversations" /></div>
        <nav className="sidebar-tabs" aria-label="Conversation type">
          <button className={activeTab === 'messages' ? 'selected' : ''} onClick={() => setActiveTab('messages')}>Messages</button>
          <button className={activeTab === 'rooms' ? 'selected' : ''} onClick={() => setActiveTab('rooms')}>Rooms</button>
        </nav>
        <section className="conversation-list">
          <div className="section-heading"><span>{activeTab === 'messages' ? 'DIRECT MESSAGES' : 'YOUR ROOMS'}</span><button className="icon-button" aria-label={activeTab === 'messages' ? 'New message' : 'Create room'}>＋</button></div>
          <div className="empty-list">
            <div className="empty-glyph">{activeTab === 'messages' ? '✳' : '◌'}</div>
            <strong>{activeTab === 'messages' ? 'No conversations yet' : 'No rooms yet'}</strong>
            <span>{activeTab === 'messages' ? 'Your direct messages will show up here.' : 'Rooms you join will show up here.'}</span>
          </div>
        </section>
        <footer className="sidebar-footer"><span className={`connection-dot ${connectionState}`} />{connectionState === 'connected' ? 'Connected' : connectionState === 'error' ? 'Connection issue' : 'Connecting…'}</footer>
      </aside>
      <section className="main-panel">
        {activePeer ? (
          <DirectConversation peer={activePeer.peer} conversationId={activePeer.conversationId} />
        ) : (
          <div className="welcome-panel">
            <div className="welcome-art"><div className="art-bubble bubble-a">✦</div><div className="art-bubble bubble-b">···</div><div className="art-core"><span>✳</span></div><div className="art-spark spark-a">✦</div><div className="art-spark spark-b">✧</div></div>
            <p className="eyebrow">A LITTLE SPACE TO CONNECT</p>
            <h1>Your conversations,<br />all in one place.</h1>
            <p className="muted">Choose a chat from the sidebar to get started. Your people are just a message away.</p>
          </div>
        )}
      </section>
    </main>
  );
}
