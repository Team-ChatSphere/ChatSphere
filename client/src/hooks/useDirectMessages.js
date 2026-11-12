import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api/client.js';

export const PAGE_SIZE = 30;
const SEND_TIMEOUT_MS = 10000;
const TYPING_IDLE_MS = 3000; // stop "typing" after this long without a keystroke (FR-010)
const TYPING_STALE_MS = 4000; // hide the peer's indicator if no update arrives

// Server statuses only move forward (FR-011); events can arrive out of order.
const STATUS_RANK = { sent: 1, delivered: 2, read: 3 };
const laterStatus = (a, b) => ((STATUS_RANK[a] || 0) > (STATUS_RANK[b] || 0) ? a : b);

const newKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Unsent messages have no timestamp yet and stay at the bottom.
const sortTime = (m) => (m.timestamp ? new Date(m.timestamp).getTime() : Infinity);

// Insert a message, or merge it into its existing copy: same server id, or the
// optimistic copy with the same idempotency key.
export function upsertMessage(list, msg) {
  const i = list.findIndex(
    (m) => (msg.id && m.id === msg.id) || (msg.idempotencyKey && m.idempotencyKey === msg.idempotencyKey)
  );
  if (i === -1) return [...list, msg].sort((a, b) => sortTime(a) - sortTime(b));
  const next = [...list];
  const merged = { ...next[i], ...msg };
  if (STATUS_RANK[next[i].status] && STATUS_RANK[msg.status]) merged.status = laterStatus(next[i].status, msg.status);
  next[i] = merged;
  return next;
}

/**
 * DM state for one conversation (CS-13): history (FR-018), sending with an
 * idempotency key (SAD 3.4.2) and live updates (FR-008). Messages are kept
 * oldest first for rendering.
 */
export function useDirectMessages({ socket, token, me, peer, conversationId, onConversationId }) {
  const [roomId, setRoomId] = useState(conversationId || null);
  const [messages, setMessages] = useState([]);
  const [nextPage, setNextPage] = useState(null);
  const [loading, setLoading] = useState(Boolean(conversationId));
  const [error, setError] = useState('');
  const roomRef = useRef(roomId);
  const sentKeys = useRef(new Set());
  const readReported = useRef(new Set());
  const [peerTyping, setPeerTyping] = useState(false);
  const typingSent = useRef(false);
  const typingStopTimer = useRef(null);
  const peerTypingTimer = useRef(null);
  const onConversationIdRef = useRef(onConversationId);
  roomRef.current = roomId;
  onConversationIdRef.current = onConversationId;

  // A brand-new DM learns its room id from the first message the server returns.
  const adoptRoom = useCallback((id) => {
    if (!id || roomRef.current) return;
    roomRef.current = id;
    setRoomId(id);
    onConversationIdRef.current?.(id);
  }, []);

  const loadPage = useCallback(
    async (page) => {
      if (!roomRef.current) return;
      setLoading(true);
      setError('');
      try {
        const result = await apiRequest(
          `/api/messages/${roomRef.current}?page=${page}&pageSize=${PAGE_SIZE}`,
          { token }
        );
        // API returns newest first; the first page replaces everything except unsent messages.
        setMessages((current) =>
          result.messages.reduce(upsertMessage, page === 1 ? current.filter((m) => !m.id) : current)
        );
        setNextPage(result.nextPage);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (conversationId) loadPage(1);
    // Only the conversation this view was opened with; later ids come from adoptRoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!socket) return undefined;

    const onNew = (msg) => {
      if (msg.kind && msg.kind !== 'direct') return;
      const belongs = roomRef.current
        ? msg.roomId === roomRef.current
        : msg.senderId === peer.id || sentKeys.current.has(msg.idempotencyKey);
      if (!belongs) return;
      adoptRoom(msg.roomId);
      setMessages((current) => upsertMessage(current, msg));
    };

    const onStatus = ({ messageId, idempotencyKey, status }) => {
      setMessages((current) =>
        current.map((m) =>
          m.id === messageId || (idempotencyKey && m.idempotencyKey === idempotencyKey)
            ? { ...m, id: m.id || messageId, status: laterStatus(m.status, status), error: undefined }
            : m
        )
      );
    };

    // FR-010: show the peer's typing state for this conversation only.
    const onTyping = (update) => {
      if (update.userId !== peer.id || !roomRef.current || update.conversationId !== roomRef.current) return;
      clearTimeout(peerTypingTimer.current);
      setPeerTyping(update.typing);
      if (update.typing) peerTypingTimer.current = setTimeout(() => setPeerTyping(false), TYPING_STALE_MS);
    };

    socket.on('message:new', onNew);
    socket.on('message:status', onStatus);
    socket.on('typing:update', onTyping);
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:status', onStatus);
      socket.off('typing:update', onTyping);
    };
  }, [socket, peer.id, adoptRoom]);

  // FR-011: tell the server when the peer's messages have been seen in this open conversation.
  useEffect(() => {
    if (!socket) return;
    for (const m of messages) {
      if (m.id && m.senderId !== me.id && m.status !== 'read' && !readReported.current.has(m.id)) {
        readReported.current.add(m.id);
        socket.emit('message:read', { messageId: m.id });
      }
    }
  }, [messages, socket, me.id]);

  useEffect(() => () => {
    clearTimeout(typingStopTimer.current);
    clearTimeout(peerTypingTimer.current);
  }, []);

  const stopTyping = useCallback(() => {
    clearTimeout(typingStopTimer.current);
    if (typingSent.current && socket && roomRef.current) socket.emit('typing:stop', { conversationId: roomRef.current });
    typingSent.current = false;
  }, [socket]);

  // Call on every keystroke: one typing:start, then typing:stop after a pause.
  const notifyTyping = useCallback(() => {
    if (!socket || !roomRef.current) return;
    if (!typingSent.current) {
      socket.emit('typing:start', { conversationId: roomRef.current });
      typingSent.current = true;
    }
    clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(stopTyping, TYPING_IDLE_MS);
  }, [socket, stopTyping]);

  const send = useCallback(
    (content, retryKey) => {
      const text = content.trim();
      if (!text || !socket) return;
      stopTyping();
      // A retry reuses the original key so the server can't store it twice.
      const idempotencyKey = retryKey || newKey();
      sentKeys.current.add(idempotencyKey);
      setMessages((current) =>
        upsertMessage(current, { idempotencyKey, senderId: me.id, content: text, status: 'sending', error: undefined })
      );

      socket
        .timeout(SEND_TIMEOUT_MS)
        .emit('message:send', { toUserId: peer.id, content: text, idempotencyKey }, (timeoutErr, res) => {
          if (!timeoutErr && res?.ok) {
            adoptRoom(res.message.roomId);
            setMessages((current) => upsertMessage(current, res.message));
            return;
          }
          const reason = timeoutErr ? 'No response from server' : res?.error?.message || 'Not sent';
          setMessages((current) => upsertMessage(current, { idempotencyKey, status: 'failed', error: reason }));
        });
    },
    [socket, me.id, peer.id, adoptRoom, stopTyping]
  );

  const retry = useCallback((msg) => send(msg.content, msg.idempotencyKey), [send]);
  const loadOlder = useCallback(() => nextPage && loadPage(nextPage), [nextPage, loadPage]);

  return { messages, nextPage, loading, error, send, retry, loadOlder, roomId, peerTyping, notifyTyping };
}
