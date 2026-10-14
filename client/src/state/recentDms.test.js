import { describe, expect, test } from 'vitest';
import { loadRecentDms, saveRecentDms, touchDm } from './recentDms.js';

const peer = (c, username) => ({ id: c.repeat(24), username });

describe('recent DM list', () => {
  test('touchDm moves the peer to the top and keeps one entry per peer', () => {
    const list = [
      { peer: peer('a', 'alice'), conversationId: 'r1' },
      { peer: peer('b', 'bob'), conversationId: 'r2' },
    ];

    const next = touchDm(list, { peer: peer('b', 'bob') });

    expect(next.map((d) => d.peer.username)).toEqual(['bob', 'alice']);
    expect(next[0].conversationId).toBe('r2');
  });

  test('a known username and room id are not lost when an update lacks them', () => {
    const list = [{ peer: peer('b', 'bob'), conversationId: 'r2' }];

    const [entry] = touchDm(list, { peer: { id: 'b'.repeat(24) }, conversationId: null });

    expect(entry).toEqual({ peer: peer('b', 'bob'), conversationId: 'r2' });
  });

  test('an unknown peer gets a placeholder name from its id', () => {
    const [entry] = touchDm([], { peer: { id: '0123456789abcdef01234567' } });

    expect(entry.peer.username).toBe('user …234567');
  });

  test('the list is stored per user', () => {
    saveRecentDms('u1', [{ peer: peer('b', 'bob'), conversationId: null }]);

    expect(loadRecentDms('u1')).toHaveLength(1);
    expect(loadRecentDms('u2')).toEqual([]);
  });
});
