const express = require('express');
const request = require('supertest');
const { createRoomsRouter } = require('../../src/routes/rooms');
const { AppError } = require('../../src/utils/errors');

const ALICE = 'a'.repeat(24);
const ROOM = 'd'.repeat(24);

function fakeAuth(req, res, next) {
  if (req.headers.authorization !== 'Bearer valid') {
    return res.status(401).json({ error: { code: 'AUTH_INVALID_TOKEN', message: 'Invalid or missing token' } });
  }
  req.user = { id: ALICE, username: 'alice' };
  return next();
}

function appWith(service, messagingService, RoomModel = { find: () => ({ select: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }) }) }) {
  const app = express();
  app.use('/api/rooms', fakeAuth, createRoomsRouter({ service, messagingService, RoomModel }));
  return app;
}

describe('room REST routes (CS-40, CS-41)', () => {
  test('GET /api/rooms/:roomId/messages returns paginated history', async () => {
    const body = { messages: [{ id: '1', content: 'hi' }], nextPage: 2 };
    const messagingService = { getHistory: jest.fn().mockResolvedValue(body) };
    const service = { listMembers: jest.fn() };

    const res = await request(appWith(service, messagingService))
      .get(`/api/rooms/${ROOM}/messages?page=1&pageSize=1`)
      .set('Authorization', 'Bearer valid');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(body);
    expect(messagingService.getHistory).toHaveBeenCalledWith({ userId: ALICE, conversationId: ROOM, page: '1', pageSize: '1' });
  });

  test('room history rejects missing auth before calling the service', async () => {
    const messagingService = { getHistory: jest.fn() };
    const res = await request(appWith({}, messagingService)).get(`/api/rooms/${ROOM}/messages`);

    expect(res.status).toBe(401);
    expect(messagingService.getHistory).not.toHaveBeenCalled();
  });

  test('room history preserves 403 membership errors', async () => {
    const messagingService = { getHistory: jest.fn().mockRejectedValue(new AppError('AUTH_FORBIDDEN', 'Not a member')) };
    const res = await request(appWith({}, messagingService))
      .get(`/api/rooms/${ROOM}/messages`)
      .set('Authorization', 'Bearer valid');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: 'AUTH_FORBIDDEN', message: 'Not a member' } });
  });

  test('GET /api/rooms/:roomId/members returns membership data', async () => {
    const members = [{ userId: ALICE, username: 'alice', role: 'admin', status: 'online' }];
    const service = { listMembers: jest.fn().mockResolvedValue(members) };

    const res = await request(appWith(service, {}))
      .get(`/api/rooms/${ROOM}/members`)
      .set('Authorization', 'Bearer valid');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ members });
    expect(service.listMembers).toHaveBeenCalledWith({ userId: ALICE, roomId: ROOM });
  });

  test('room search returns only group room names and ids', async () => {
    const rooms = [{ _id: ROOM, name: 'design team' }];
    const RoomModel = { find: jest.fn(() => ({
      select: () => ({ sort: () => ({ limit: () => ({ lean: async () => rooms }) }) }),
    })) };
    const res = await request(appWith({}, {}, RoomModel))
      .get('/api/rooms?search=design')
      .set('Authorization', 'Bearer valid');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ rooms: [{ roomId: ROOM, name: 'design team' }] });
    expect(RoomModel.find).toHaveBeenCalledWith({ type: 'group', name: { $regex: 'design', $options: 'i' } });
  });
});
