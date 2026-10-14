import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../state/AuthContext.jsx';
import { useSocket } from '../state/SocketContext.jsx';
import './RoomsPanel.css';

const storageKey = (userId) => `chatsphere.rooms.${userId}`;
const loadRooms = (userId) => {
  try {
    const rooms = JSON.parse(window.localStorage.getItem(storageKey(userId)) || '[]');
    return Array.isArray(rooms) ? rooms : [];
  } catch {
    return [];
  }
};

function acknowledge(socket, event, payload) {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) return reject(new Error('Connect to the server before using rooms.'));
    socket.timeout(10000).emit(event, payload, (timeoutError, result) => {
      if (timeoutError) return reject(new Error('The server did not respond. Please try again.'));
      if (!result?.ok) return reject(new Error(result?.error?.message || 'The room action failed.'));
      resolve(result);
    });
  });
}

function RoomConversation({ room, socket, user, onLeave }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setMessages([]);
    const onMessage = (message) => {
      if (message.kind === 'room' && message.roomId === room.roomId) {
        setMessages((current) => current.some((item) => item.id === message.id)
          ? current
          : [...current, message]);
      }
    };
    socket?.on('message:new', onMessage);
    return () => socket?.off('message:new', onMessage);
  }, [room.roomId, socket]);

  const send = async (event) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setError('');
    setDraft('');
    try {
      await acknowledge(socket, 'message:send', {
        roomId: room.roomId,
        content,
        idempotencyKey: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      });
    } catch (sendError) {
      setDraft(content);
      setError(sendError.message);
    }
  };

  return (
    <section className="room-conversation" aria-label={`Room ${room.name}`}>
      <header className="conversation-header room-header">
        <div className="avatar room-avatar">#</div>
        <div><strong>{room.name}</strong><span className="muted">Room · share ID {room.roomId}</span></div>
        <button className="text-button" onClick={onLeave}>Leave room</button>
      </header>
      <div className="room-scroll" aria-live="polite">
        {messages.length === 0 ? (
          <div className="conversation-empty"><div className="avatar avatar-large room-avatar">#</div><h2>{room.name}</h2><p className="muted">Send a message to start the conversation. Messages appear live while you’re connected.</p></div>
        ) : (
          <ol className="room-messages">
            {messages.map((message) => {
              const mine = message.senderId === user.id;
              const author = mine ? 'You' : `Member ${message.senderId.slice(0, 6)}`;
              return <li className={`room-message ${mine ? 'mine' : ''}`} key={message.id}>
                <span className="room-author">{author}</span><p>{message.content}</p>
                <time>{message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</time>
              </li>;
            })}
          </ol>
        )}
      </div>
      {error && <p className="form-error room-error" role="alert">{error}</p>}
      <form className="room-composer" onSubmit={send}>
        <input aria-label={`Message ${room.name}`} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder={`Message #${room.name}`} />
        <button className="button button-primary" disabled={!draft.trim()}>Send</button>
      </form>
    </section>
  );
}

export default function RoomsPanel() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [rooms, setRooms] = useState(() => user ? loadRooms(user.id) : []);
  const [activeRoomId, setActiveRoomId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const activeRoom = rooms.find((room) => room.roomId === activeRoomId);

  useEffect(() => {
    if (user) window.localStorage.setItem(storageKey(user.id), JSON.stringify(rooms));
  }, [rooms, user]);

  const restoreMemberships = useCallback(() => {
    if (!socket?.connected) return;
    rooms.forEach((room) => socket.emit('room:join', { roomId: room.roomId }));
  }, [rooms, socket]);

  useEffect(() => {
    if (!socket) return undefined;
    socket.on('connect', restoreMemberships);
    restoreMemberships();
    return () => socket.off('connect', restoreMemberships);
  }, [socket, restoreMemberships]);

  async function createRoom(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await acknowledge(socket, 'room:create', { name: roomName });
      const room = { roomId: result.room.roomId, name: result.room.name };
      setRooms((current) => current.some((item) => item.roomId === room.roomId) ? current : [...current, room]);
      setActiveRoomId(room.roomId);
      setRoomName('');
      setCreateOpen(false);
    } catch (createError) {
      setError(createError.message);
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await acknowledge(socket, 'room:join', { roomId: roomId.trim() });
      const room = { roomId: result.roomId, name: `Room ${result.roomId.slice(0, 6)}` };
      setRooms((current) => current.some((item) => item.roomId === room.roomId) ? current : [...current, room]);
      setActiveRoomId(room.roomId);
      setRoomId('');
    } catch (joinError) {
      setError(joinError.message);
    } finally {
      setBusy(false);
    }
  }

  async function leaveRoom(room) {
    setError('');
    try {
      await acknowledge(socket, 'room:leave', { roomId: room.roomId });
      setRooms((current) => current.filter((item) => item.roomId !== room.roomId));
      setActiveRoomId('');
    } catch (leaveError) {
      setError(leaveError.message);
    }
  }

  const roomList = useMemo(() => rooms.map((room) => (
    <li key={room.roomId}>
      <button className={`room-list-button ${activeRoomId === room.roomId ? 'active' : ''}`} onClick={() => setActiveRoomId(room.roomId)}>
        <span className="room-list-mark">#</span><span className="room-list-copy"><strong>{room.name}</strong><small>{room.roomId.slice(0, 8)}…</small></span>
      </button>
    </li>
  )), [rooms, activeRoomId]);

  return (
    <div className="rooms-layout">
      <aside className="rooms-sidebar">
        <div className="rooms-title-row"><div><p className="eyebrow">YOUR COMMUNITY</p><h2>Rooms</h2></div><button className="icon-button" aria-label="Create room" onClick={() => setCreateOpen((open) => !open)}>＋</button></div>
        {createOpen && <form className="room-form" onSubmit={createRoom}>
          <label htmlFor="new-room-name">Create a room</label>
          <input id="new-room-name" autoFocus value={roomName} onChange={(event) => setRoomName(event.target.value)} maxLength={50} placeholder="e.g. design-team" />
          <button className="button button-primary" disabled={busy || !roomName.trim()}>Create room</button>
        </form>}
        <form className="room-form join-room-form" onSubmit={joinRoom}>
          <label htmlFor="join-room-id">Join with room ID</label>
          <input id="join-room-id" value={roomId} onChange={(event) => setRoomId(event.target.value)} placeholder="Paste a room ID" />
          <button className="button" disabled={busy || !roomId.trim()}>Join room</button>
        </form>
        {error && <p className="form-error room-sidebar-error" role="alert">{error}</p>}
        {rooms.length ? <ul className="room-list">{roomList}</ul> : <div className="rooms-empty"><span>◌</span><strong>No rooms yet</strong><small>Create one or join with a room ID.</small></div>}
        <p className="room-note">Share the room ID so others can join. Room names are saved in this browser.</p>
      </aside>
      <section className="rooms-main">
        {activeRoom && socket ? <RoomConversation key={activeRoom.roomId} room={activeRoom} socket={socket} user={user} onLeave={() => leaveRoom(activeRoom)} /> : (
          <div className="welcome-panel room-welcome"><div className="empty-glyph">#</div><p className="eyebrow">MAKE SPACE FOR A GROUP</p><h1>Bring everyone<br />into the conversation.</h1><p className="muted">Create a room, share its ID, and chat together live.</p></div>
        )}
      </section>
    </div>
  );
}
