import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../api/client.js';
import { useAuth } from '../state/AuthContext.jsx';
import { useSocket } from '../state/SocketContext.jsx';
import { decodeEntities } from '../utils/text.js';
import './RoomsPanel.css';

const storageKey = (userId) => `chatsphere.rooms.${userId}`;
const noop = () => {};
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

function sortMessages(messages) {
  return [...messages].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function RoomConversation({ room, socket, user, token, onLeave, onRemoved }) {
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [membersError, setMembersError] = useState('');
  const isAdmin = members.some((member) => member.userId === user.id && member.role === 'admin');

  const refreshMembers = useCallback(async () => {
    try {
      const result = await apiRequest(`/api/rooms/${room.roomId}/members`, { token });
      setMembers(Array.isArray(result?.members) ? result.members : []);
      setMembersError('');
    } catch (requestError) {
      setMembersError(requestError.message);
    }
  }, [room.roomId, token]);

  useEffect(() => {
    let active = true;
    apiRequest(`/api/rooms/${room.roomId}/messages?page=1&pageSize=100`, { token })
      .then((result) => {
        if (!active) return;
        setMessages((current) => sortMessages([...new Map([...result.messages, ...current].map((message) => [message.id, message])).values()]));
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => { if (active) setLoadingHistory(false); });
    refreshMembers();
    return () => { active = false; };
  }, [refreshMembers, room.roomId, token]);

  useEffect(() => {
    const onMessage = (message) => {
      if (message.kind === 'room' && message.roomId === room.roomId) {
        setMessages((current) => sortMessages([...new Map([...current, message].map((item) => [item.id, item])).values()]));
      }
    };
    const onMembershipChange = (event) => {
      if (event.roomId !== room.roomId) return;
      refreshMembers();
    };
    const onMemberRemoved = (event) => {
      if (event.roomId !== room.roomId) return;
      if (event.userId === user.id) onRemoved(room.roomId);
      else refreshMembers();
    };
    const onPresence = (event) => {
      setMembers((current) => current.map((member) => member.userId === event.userId
        ? { ...member, status: event.status }
        : member));
    };
    socket?.on('message:new', onMessage);
    socket?.on('room:memberJoined', onMembershipChange);
    socket?.on('room:memberLeft', onMembershipChange);
    socket?.on('room:memberPromoted', onMembershipChange);
    socket?.on('room:memberRemoved', onMemberRemoved);
    socket?.on('presence:update', onPresence);
    return () => {
      socket?.off('message:new', onMessage);
      socket?.off('room:memberJoined', onMembershipChange);
      socket?.off('room:memberLeft', onMembershipChange);
      socket?.off('room:memberPromoted', onMembershipChange);
      socket?.off('room:memberRemoved', onMemberRemoved);
      socket?.off('presence:update', onPresence);
    };
  }, [onRemoved, refreshMembers, room.roomId, socket, user.id]);

  async function manageMember(eventName, targetUserId) {
    setError('');
    try {
      await acknowledge(socket, eventName, { roomId: room.roomId, userId: targetUserId });
      await refreshMembers();
    } catch (actionError) {
      setError(actionError.message);
    }
  }

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
      <div className="room-content">
        <div className="room-scroll" aria-live="polite">
          {loadingHistory && messages.length === 0 ? <p className="muted room-loading">Loading messages…</p> : messages.length === 0 ? (
            <div className="conversation-empty"><div className="avatar avatar-large room-avatar">#</div><h2>{room.name}</h2><p className="muted">Send a message to start the conversation. Messages appear live while you’re connected.</p></div>
          ) : (
            <ol className="room-messages">
              {messages.map((message) => {
                const mine = message.senderId === user.id;
                const author = mine ? 'You' : `Member ${message.senderId.slice(0, 6)}`;
                return <li className={`room-message ${mine ? 'mine' : ''}`} key={message.id}>
                  <span className="room-author">{author}</span><p>{decodeEntities(message.content)}</p>
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
      </div>
      <aside className="room-members" aria-label="Room members">
        <h3>Members <span>{members.length}</span></h3>
        {membersError && <p className="form-error" role="alert">{membersError}</p>}
        <ul>
          {members.map((member) => (
            <li className="room-member" key={member.userId}>
              <span className={`presence-dot ${member.status === 'online' ? 'online' : ''}`} aria-label={member.status === 'online' ? 'Online' : 'Offline'} />
              <span className="room-member-name">{member.username}{member.userId === user.id ? ' (you)' : ''}</span>
              <span className={`role-badge ${member.role}`}>{member.role}</span>
              {isAdmin && member.role !== 'admin' && <button className="text-button" onClick={() => manageMember('room:promote', member.userId)}>Promote</button>}
              {isAdmin && member.userId !== user.id && <button className="text-button danger-text" onClick={() => manageMember('room:removeMember', member.userId)}>Remove</button>}
            </li>
          ))}
        </ul>
      </aside>
    </section>
  );
}

export default function RoomsPanel({ joinRoomSelection = null, onRoomSelectionHandled = noop }) {
  const { token, user } = useAuth();
  const { socket } = useSocket();
  const [rooms, setRooms] = useState(() => user ? loadRooms(user.id) : []);
  const [activeRoomId, setActiveRoomId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [unread, setUnread] = useState({});
  const handledRoomSelection = useRef('');
  const activeRoom = rooms.find((room) => room.roomId === activeRoomId);
  const activeRoomIdRef = useRef(activeRoomId);
  activeRoomIdRef.current = activeRoomId;

  useEffect(() => {
    if (user) window.localStorage.setItem(storageKey(user.id), JSON.stringify(rooms));
  }, [rooms, user]);

  useEffect(() => {
    if (!socket || !user) return undefined;
    const onMessage = (message) => {
      if (message.kind !== 'room' || message.senderId === user.id || message.roomId === activeRoomIdRef.current) return;
      setUnread((current) => ({ ...current, [message.roomId]: (current[message.roomId] || 0) + 1 }));
    };
    socket.on('message:new', onMessage);
    return () => socket.off('message:new', onMessage);
  }, [socket, user]);

  const openRoom = useCallback((roomIdToOpen) => {
    setActiveRoomId(roomIdToOpen);
    setUnread((current) => ({ ...current, [roomIdToOpen]: 0 }));
  }, []);

  const restoreMemberships = useCallback(() => {
    if (!socket?.connected) return;
    rooms.forEach((room) => {
      socket.timeout(10000).emit('room:restore', { roomId: room.roomId }, (timeoutError, result) => {
        // Keep cached rooms on transient failures; remove one only when the
        // server confirms that this user is no longer a member.
        if (timeoutError || !result?.ok || result.joined) return;
        setRooms((current) => current.filter((item) => item.roomId !== room.roomId));
        setActiveRoomId((current) => current === room.roomId ? '' : current);
      });
    });
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
      openRoom(room.roomId);
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
      await joinAndOpenRoom(roomId.trim());
      setRoomId('');
    } catch (joinError) {
      setError(joinError.message);
    } finally {
      setBusy(false);
    }
  }

  const joinAndOpenRoom = useCallback(async (id, knownName = '') => {
    const result = await acknowledge(socket, 'room:join', { roomId: id });
    const room = { roomId: result.roomId, name: knownName || `Room ${result.roomId.slice(0, 6)}` };
    setRooms((current) => current.some((item) => item.roomId === room.roomId) ? current : [...current, room]);
    openRoom(room.roomId);
  }, [openRoom, socket]);

  useEffect(() => {
    if (!joinRoomSelection) {
      handledRoomSelection.current = '';
      return undefined;
    }
    const key = joinRoomSelection.roomId;
    if (handledRoomSelection.current === key) return undefined;
    let cancelled = false;
    const joinSelection = async () => {
      if (handledRoomSelection.current === key) return;
      handledRoomSelection.current = key;
      setBusy(true);
      setError('');
      try {
        await joinAndOpenRoom(key, joinRoomSelection.name);
      } catch (joinError) {
        if (!cancelled) setError(joinError.message);
      } finally {
        if (!cancelled) {
          setBusy(false);
          onRoomSelectionHandled();
        }
      }
    };
    if (socket?.connected) joinSelection();
    else socket?.once('connect', joinSelection);
    return () => {
      cancelled = true;
      socket?.off('connect', joinSelection);
    };
  }, [joinAndOpenRoom, joinRoomSelection, onRoomSelectionHandled, socket]);

  async function leaveRoom(room) {
    setError('');
    try {
      await acknowledge(socket, 'room:leave', { roomId: room.roomId });
      setRooms((current) => current.filter((item) => item.roomId !== room.roomId));
      setActiveRoomId('');
      setUnread((current) => { const next = { ...current }; delete next[room.roomId]; return next; });
    } catch (leaveError) {
      setError(leaveError.message);
    }
  }

  const removeRoomLocally = useCallback((roomIdToRemove) => {
    setRooms((current) => current.filter((item) => item.roomId !== roomIdToRemove));
    setActiveRoomId((current) => current === roomIdToRemove ? '' : current);
    setUnread((current) => { const next = { ...current }; delete next[roomIdToRemove]; return next; });
    setError('You were removed from a room.');
  }, []);

  const roomList = useMemo(() => rooms.map((room) => (
    <li key={room.roomId}>
      <button className={`room-list-button ${activeRoomId === room.roomId ? 'active' : ''}`} onClick={() => openRoom(room.roomId)}>
        <span className="room-list-mark">#</span><span className="room-list-copy"><strong>{room.name}</strong><small>{room.roomId.slice(0, 8)}…</small></span>
        {unread[room.roomId] > 0 && <span className="room-unread" aria-label={`${unread[room.roomId]} unread messages`}>{unread[room.roomId]}</span>}
      </button>
    </li>
  )), [rooms, activeRoomId, unread, openRoom]);

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
        {activeRoom && socket ? <RoomConversation key={activeRoom.roomId} room={activeRoom} socket={socket} user={user} token={token} onLeave={() => leaveRoom(activeRoom)} onRemoved={removeRoomLocally} /> : (
          <div className="welcome-panel room-welcome"><div className="empty-glyph">#</div><p className="eyebrow">MAKE SPACE FOR A GROUP</p><h1>Bring everyone<br />into the conversation.</h1><p className="muted">Create a room, share its ID, and chat together live.</p></div>
        )}
      </section>
    </div>
  );
}
