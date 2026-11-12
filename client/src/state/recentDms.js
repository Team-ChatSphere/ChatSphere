// The DM list is kept per user in localStorage until there's a conversations
// API (CS-33). Storage can be unavailable (private mode), so failures are ignored.
const storageKey = (userId) => `chatsphere.dms.${userId}`;

export function loadRecentDms(userId) {
  try {
    return JSON.parse(window.localStorage.getItem(storageKey(userId)) || '[]');
  } catch {
    return [];
  }
}

export function saveRecentDms(userId, list) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(list));
  } catch {
    // Not persisted; the list still works for this session.
  }
}

// Moves the peer's entry to the top, keeping any known username/room id.
export function touchDm(list, { peer, conversationId }) {
  const existing = list.find((d) => d.peer.id === peer.id);
  const entry = {
    peer: { id: peer.id, username: peer.username || existing?.peer.username || `user …${peer.id.slice(-6)}` },
    conversationId: conversationId || existing?.conversationId || null,
  };
  return [entry, ...list.filter((d) => d.peer.id !== peer.id)];
}
