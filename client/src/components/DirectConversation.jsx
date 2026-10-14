export default function DirectConversation({ peer, conversationId }) {
  return (
    <section className="conversation-placeholder" aria-label={`Conversation with ${peer.username}`}>
      <header className="conversation-header">
        <div className="avatar">{peer.username.slice(0, 1).toUpperCase()}</div>
        <div><strong>{peer.username}</strong><span className="muted">Direct message</span></div>
      </header>
      <div className="conversation-empty">
        <div className="avatar avatar-large">{peer.username.slice(0, 1).toUpperCase()}</div>
        <h2>{peer.username}</h2>
        <p className="muted">{conversationId ? 'Your conversation is ready.' : 'Say hello to start a conversation.'}</p>
      </div>
    </section>
  );
}
