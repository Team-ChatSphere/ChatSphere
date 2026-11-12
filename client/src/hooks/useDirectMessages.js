import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api/client.js';

export const PAGE_SIZE = 30;
const SEND_TIMEOUT_MS = 10000;

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
  next[i] = { ...next[i], ...msg };
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
            ? { ...m, id: m.id || messageId, status, error: undefined }
            : m
        )
      );
    };

    socket.on('message:new', onNew);
    socket.on('message:status', onStatus);
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:status', onStatus);
    };
  }, [socket, peer.id, adoptRoom]);

  const send = useCallback(
    (content, retryKey) => {
      const text = content.trim();
      if (!text || !socket) return;
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
    [socket, me.id, peer.id, adoptRoom]
  );

  const retry = useCallback((msg) => send(msg.content, msg.idempotencyKey), [send]);
  const loadOlder = useCallback(() => nextPage && loadPage(nextPage), [nextPage, loadPage]);

  return { messages, nextPage, loading, error, send, retry, loadOlder, roomId };
}
