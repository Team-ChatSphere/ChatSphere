import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../state/AuthContext.jsx';
import { useSocket } from '../state/SocketContext.jsx';
import { useDirectMessages } from '../hooks/useDirectMessages.js';
import './DirectConversation.css';

const MAX_LENGTH = 2000;

const STATUS_LABEL = {
  sending: { icon: '…', text: 'Sending' },
  sent: { icon: '✓', text: 'Sent' },
  delivered: { icon: '✓✓', text: 'Delivered' },
  read: { icon: '✓✓', text: 'Read' },
};

const formatTime = (timestamp) =>
  timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

function MessageBubble({ message, mine, onRetry }) {
  const status = STATUS_LABEL[message.status];
  return (
    <li className={`dm-message ${mine ? 'mine' : 'theirs'}`}>
      {/* Rendered as text, never HTML, so message content can't inject markup. */}
      <p className="dm-bubble">{message.content}</p>
      <span className="dm-meta">
        {formatTime(message.timestamp)}
        {mine && message.status === 'failed' && (
          <span className="dm-failed" role="alert">
            {message.error || 'Not sent'} ·{' '}
            <button type="button" className="dm-retry" onClick={() => onRetry(message)}>Retry</button>
          </span>
        )}
        {mine && status && (
          <span className={`dm-status dm-status-${message.status}`} title={status.text} aria-label={status.text}>
            {status.icon}
          </span>
        )}
      </span>
    </li>
  );
}

export default function DirectConversation({ peer, conversationId, onConversationId }) {
  const { token, user } = useAuth();
  const { socket } = useSocket();
  const { messages, nextPage, loading, error, send, retry, loadOlder } = useDirectMessages({
    socket,
    token,
    me: user,
    peer,
    conversationId,
    onConversationId,
  });
  const [draft, setDraft] = useState('');
  const endRef = useRef(null);
  const lastMessageKey = messages.length ? messages[messages.length - 1].id || messages[messages.length - 1].idempotencyKey : null;

  // Follow new messages at the bottom (not when older pages load above).
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [lastMessageKey]);

  function submit(event) {
    event.preventDefault();
    if (!draft.trim()) return;
    send(draft);
    setDraft('');
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) submit(event);
  }

  const initial = peer.username.slice(0, 1).toUpperCase();

  return (
    <section className="dm-view" aria-label={`Conversation with ${peer.username}`}>
      <header className="conversation-header">
        <div className="avatar">{initial}</div>
        <div><strong>{peer.username}</strong><span className="muted">Direct message</span></div>
      </header>

      <div className="dm-scroll">
        {nextPage && (
          <button type="button" className="dm-load-older" onClick={loadOlder} disabled={loading}>
            {loading ? 'Loading…' : 'Load older messages'}
          </button>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        {!loading && !error && messages.length === 0 && (
          <div className="conversation-empty">
            <div className="avatar avatar-large">{initial}</div>
            <h2>{peer.username}</h2>
            <p className="muted">Say hello to start a conversation.</p>
          </div>
        )}
        <ol className="dm-messages">
          {messages.map((m) => (
            <MessageBubble key={m.idempotencyKey || m.id} message={m} mine={m.senderId === user.id} onRetry={retry} />
          ))}
        </ol>
        <div ref={endRef} />
      </div>

      <form className="dm-composer" onSubmit={submit}>
        <textarea
          aria-label={`Message ${peer.username}`}
          placeholder={`Message ${peer.username}`}
          value={draft}
          maxLength={MAX_LENGTH}
          rows={1}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {draft.length > MAX_LENGTH - 200 && <span className="dm-counter">{MAX_LENGTH - draft.length}</span>}
        <button className="button button-primary" disabled={!draft.trim() || !socket}>Send</button>
      </form>
    </section>
  );
}
