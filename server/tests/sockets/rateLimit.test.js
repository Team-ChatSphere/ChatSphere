const { createTokenBucket, rateLimitMiddleware } = require('../../src/sockets/rateLimit');

describe('token bucket (SEC-005)', () => {
  test('allows a burst up to capacity, then refills over time', () => {
    let t = 0;
    const take = createTokenBucket({ capacity: 3, refillPerSec: 2, now: () => t });

    expect([take(), take(), take(), take()]).toEqual([true, true, true, false]);
    t += 500; // +1 token
    expect([take(), take()]).toEqual([true, false]);
    t += 10_000; // refills, but never above capacity
    expect([take(), take(), take(), take()]).toEqual([true, true, true, false]);
  });
});

describe('rateLimitMiddleware', () => {
  const setup = () => {
    let t = 0;
    const socket = { user: { id: 'u1' }, emit: jest.fn() };
    const mw = rateLimitMiddleware(socket, { capacity: 2, refillPerSec: 1, now: () => t });
    return { socket, mw, tick: (ms) => (t += ms) };
  };

  test('over the limit: no next(), RATE_LIMITED on ack and error event, logged once per burst', () => {
    const { socket, mw } = setup();
    const next = jest.fn();
    const ack = jest.fn();
    const log = jest.spyOn(console, 'warn').mockImplementation(() => {});

    for (let i = 0; i < 4; i += 1) mw(['message:send', { content: 'x' }, ack], next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(ack).toHaveBeenCalledTimes(2);
    expect(ack).toHaveBeenLastCalledWith({ ok: false, error: { code: 'RATE_LIMITED', message: expect.any(String) } });
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ code: 'RATE_LIMITED' }));
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ event: 'rate_limited', userId: 'u1' });
    log.mockRestore();
  });

  test('other events are never limited', () => {
    const { mw } = setup();
    const next = jest.fn();

    for (let i = 0; i < 10; i += 1) mw(['typing:start', {}], next);

    expect(next).toHaveBeenCalledTimes(10);
  });
});
