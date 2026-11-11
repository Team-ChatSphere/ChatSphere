// Auth is supplied by the caller when this router is mounted. It sets req.user
// to the shared { id, username } shape from docs/INTEGRATION.md.
const express = require('express');
const { AppError, toErrorBody } = require('../utils/errors');

function createRoomsRouter({ service, messagingService, RoomModel }) {
  if (!service || !messagingService || !RoomModel) throw new Error('service, messagingService and RoomModel are required');
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const search = String(req.query.search || '').trim();
      if (search.length > 50) throw new AppError('VALIDATION_FAILED', 'Search must be at most 50 characters');
      if (search.length < 2) return res.json({ rooms: [] });
      const escaped = search.split('').map((char) => ('\\^$.*+?()[]{}|'.includes(char) ? `\\${char}` : char)).join('');
      const rooms = await RoomModel.find({ type: 'group', name: { $regex: escaped, $options: 'i' } })
        .select('_id name').sort({ name: 1 }).limit(10).lean();
      return res.json({ rooms: rooms.map((room) => ({ roomId: String(room._id), name: room.name })) });
    } catch (err) {
      if (!(err instanceof AppError)) console.error('GET /api/rooms search failed', err);
      return res.status(err instanceof AppError ? err.status : 500).json({ error: toErrorBody(err) });
    }
  });

  router.get('/:roomId/messages', async (req, res) => {
    try {
      const result = await messagingService.getHistory({
        userId: req.user.id,
        conversationId: req.params.roomId,
        page: req.query.page,
        pageSize: req.query.pageSize,
      });
      return res.json(result);
    } catch (err) {
      if (!(err instanceof AppError)) console.error('GET /api/rooms/:roomId/messages failed', err);
      return res.status(err instanceof AppError ? err.status : 500).json({ error: toErrorBody(err) });
    }
  });

  router.get('/:roomId/members', async (req, res) => {
    try {
      const members = await service.listMembers({ userId: req.user.id, roomId: req.params.roomId });
      return res.json({ members });
    } catch (err) {
      if (!(err instanceof AppError)) console.error('GET /api/rooms/:roomId/members failed', err);
      return res.status(err instanceof AppError ? err.status : 500).json({ error: toErrorBody(err) });
    }
  });

  return router;
}

module.exports = { createRoomsRouter };
