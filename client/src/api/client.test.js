import { afterEach, describe, expect, test, vi } from 'vitest';
import { apiRequest, API_URL } from './client.js';

const reply = (status, body) =>
  vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });

afterEach(() => vi.unstubAllGlobals());

describe('apiRequest', () => {
  test('defaults to the server on :4000', () => {
    expect(API_URL).toBe('http://localhost:4000');
  });

  test('sends JSON with a bearer token and returns the parsed body', async () => {
    const fetch = reply(200, { messages: [] });
    vi.stubGlobal('fetch', fetch);

    const body = await apiRequest('/api/messages/x', { token: 'jwt', method: 'POST', body: '{}' });

    expect(body).toEqual({ messages: [] });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/messages/x');
    expect(init.headers.get('Authorization')).toBe('Bearer jwt');
    expect(init.headers.get('Content-Type')).toBe('application/json');
  });

  test('no token → no Authorization header; no body → no Content-Type', async () => {
    const fetch = reply(200, {});
    vi.stubGlobal('fetch', fetch);

    await apiRequest('/api/health');

    const { headers } = fetch.mock.calls[0][1];
    expect(headers.has('Authorization')).toBe(false);
    expect(headers.has('Content-Type')).toBe(false);
  });

  test('an error response throws with the server message, code and status', async () => {
    vi.stubGlobal('fetch', reply(403, { error: { code: 'AUTH_FORBIDDEN', message: 'Not a participant' } }));

    await expect(apiRequest('/api/messages/x')).rejects.toMatchObject({
      message: 'Not a participant',
      code: 'AUTH_FORBIDDEN',
      status: 403,
    });
  });

  test('an error without a JSON body falls back to a generic message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error('not json'); } }));

    await expect(apiRequest('/api/x')).rejects.toMatchObject({ message: 'Request failed. Please try again.', status: 502 });
  });

  test('204 No Content resolves to null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => ({}) }));

    expect(await apiRequest('/api/x')).toBeNull();
  });
});
