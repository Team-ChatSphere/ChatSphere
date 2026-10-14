import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../state/AuthContext.jsx';
import { useSocket } from '../state/SocketContext.jsx';
import DirectConversation from '../components/DirectConversation.jsx';
import { loadRecentDms, saveRecentDms, touchDm } from '../state/recentDms.js';

const USER_ID = /^[0-9a-f]{24}$/i;

// Until user search lands (CS-33), a DM is started with the other person's user id.
function NewDirectMessage({ selfId, onStart, onCancel }) {
  const [peerId, setPeerId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  function submit(event) {
    event.preventDefault();
    const id = peerId.trim();
    if (!USER_ID.test(id)) return setError('Enter a valid user ID (24 characters).');
    if (id === selfId) return setError("You can't message yourself.");
    return onStart({ id, username: name.trim() });
  }

  return (
    <form className="new-dm" onSubmit={submit}>
      <label>Recipient user ID
        <input value={peerId} onChange={(e) => setPeerId(e.target.value)} placeholder="Ask them to copy their ID" autoFocus />
      </label>
      <label>Display name (optional)
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="text-button" onClick={onCancel}>Cancel</button>
        <button className="button button-primary">Start chat</button>
      </div>
    </form>
  );
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const { socket, connectionState } = useSocket();
  const [activeTab, setActiveTab] = useState('messages');
  const [activePeer, setActivePeer] = useState(null);
  const [dms, setDms] = useState(() => (user ? loadRecentDms(user.id) : []));
  const [composing, setComposing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (user) saveRecentDms(user.id, dms);
  }, [user, dms]);

  const rememberDm = useCallback((entry) => setDms((list) => touchDm(list, entry)), []);

  // A DM from someone new adds them to the list (FR-008).
  useEffect(() => {
    if (!socket || !user) return undefined;
    const onNew = (msg) => {
      if (msg.kind !== 'direct' || msg.senderId === user.id) return;
      rememberDm({ peer: { id: msg.senderId, username: msg.senderUsername }, conversationId: msg.roomId });
    };
    socket.on('message:new', onNew);
    return () => socket.off('message:new', onNew);
  }, [socket, user, rememberDm]);

  function openDm(entry) {
    setActivePeer(entry);
    setComposing(false);
  }

  function startDm(peer) {
    const existing = dms.find((d) => d.peer.id === peer.id);
    const entry = touchDm(dms, { peer, conversationId: existing?.conversationId })[0];
    rememberDm(entry);
    openDm(entry);
  }

  async function copyMyId() {
    try {
      await navigator.clipboard.writeText(user.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Your user ID', user.id);
    }
  }

  const activeEntry = activePeer && (dms.find((d) => d.peer.id === activePeer.peer.id) || activePeer);

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
          <button className="text-button" onClick={copyMyId} title="Share this so others can message you">{copied ? 'Copied!' : 'Copy my ID'}</button>
          <button className="text-button" onClick={signOut}>Sign out</button>
        </div>
        <div className="search-wrap"><span aria-hidden="true">⌕</span><input aria-label="Search conversations" placeholder="Search conversations" /></div>
        <nav className="sidebar-tabs" aria-label="Conversation type">
          <button className={activeTab === 'messages' ? 'selected' : ''} onClick={() => setActiveTab('messages')}>Messages</button>
          <button className={activeTab === 'rooms' ? 'selected' : ''} onClick={() => setActiveTab('rooms')}>Rooms</button>
        </nav>
        <section className="conversation-list">
          <div className="section-heading"><span>{activeTab === 'messages' ? 'DIRECT MESSAGES' : 'YOUR ROOMS'}</span><button className="icon-button" aria-label={activeTab === 'messages' ? 'New message' : 'Create room'} onClick={activeTab === 'messages' ? () => setComposing((c) => !c) : undefined}>＋</button></div>
          {activeTab === 'messages' && composing && (
            <NewDirectMessage selfId={user?.id} onStart={startDm} onCancel={() => setComposing(false)} />
          )}
          {activeTab === 'messages' && dms.length > 0 ? (
            <ul className="dm-list">
              {dms.map((d) => (
                <li key={d.peer.id}>
                  <button className={activeEntry?.peer.id === d.peer.id ? 'active' : ''} onClick={() => openDm(d)}>
                    <span className="avatar">{d.peer.username.slice(0, 1).toUpperCase()}</span>
                    {d.peer.username}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            !(activeTab === 'messages' && composing) && (
              <div className="empty-list">
                <div className="empty-glyph">{activeTab === 'messages' ? '✳' : '◌'}</div>
                <strong>{activeTab === 'messages' ? 'No conversations yet' : 'No rooms yet'}</strong>
                <span>{activeTab === 'messages' ? 'Your direct messages will show up here.' : 'Rooms you join will show up here.'}</span>
              </div>
            )
          )}
        </section>
        <footer className="sidebar-footer"><span className={`connection-dot ${connectionState}`} />{connectionState === 'connected' ? 'Connected' : connectionState === 'error' ? 'Connection issue' : 'Connecting…'}</footer>
      </aside>
      <section className="main-panel">
        {activeEntry ? (
          <DirectConversation
            key={activeEntry.peer.id}
            peer={activeEntry.peer}
            conversationId={activeEntry.conversationId}
            onConversationId={(conversationId) => rememberDm({ peer: activeEntry.peer, conversationId })}
          />
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
