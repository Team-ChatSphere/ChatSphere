// Wires every service into the REST API and the WebSocket Gateway (SAD 2.1–2.2,
// docs/INTEGRATION.md §2). Used by index.js and by the end-to-end tests.
const User = require('./models/User');
const Room = require('./models/Room');
const RoomMembership = require('./models/RoomMembership');
const { createAuthService } = require('./services/auth/authService');
const { createMessagingService } = require('./services/messaging/messagingService');
const { getOrCreateDirectRoom } = require('./services/messaging/directRoom');
const { createRoomService, isMember } = require('./services/rooms/roomService');
const { createJwtAuth, createSocketJwtAuth } = require('./middleware/jwtAuth');
const { createAuthRouter } = require('./routes/auth');
const { createMessagesRouter } = require('./routes/messages');
const { createRoomsRouter } = require('./routes/rooms');
const { createUsersRouter } = require('./routes/users');
const { registerMessagingHandlers, deliverPending, userRoom } = require('./sockets/messagingHandlers');
const { registerRoomHandlers, createRoomMessageHandler, socketRoom } = require('./sockets/roomHandlers');
const { rateLimitMiddleware } = require('./sockets/rateLimit');

/**
 * @param {object} options
 * @param {string} options.jwtSecret
 * @param {string|number} [options.jwtExpiresIn]
 * @param {number} [options.bcryptRounds]
 * @param {{ onConnect: Function, onDisconnect: Function }} [options.presence]  CS-22/CS-23
 * @param {object} [options.rateLimit]  { capacity, refillPerSec } for message:send (SEC-005)
 */
function createGateway({ jwtSecret, jwtExpiresIn, bcryptRounds, presence, rateLimit } = {}) {
  const pendingPresence = new Set();
  function schedulePresence(operation, label) {
    const pending = Promise.resolve().then(operation).catch((err) => {
      console.error(`presence ${label} failed`, err);
    });
    pendingPresence.add(pending);
    pending.finally(() => pendingPresence.delete(pending));
    return pending;
  }
  async function drainPresence() {
    while (pendingPresence.size > 0) await Promise.all([...pendingPresence]);
  }

  const authService = createAuthService({ jwtSecret, jwtExpiresIn, bcryptRounds });
  const roomService = createRoomService();
  const messagingService = createMessagingService({
    resolveDirectRoom: getOrCreateDirectRoom,
    userExists: async (id) => Boolean(await User.exists({ _id: id })),
    isMember: (userId, roomId) => isMember(userId, roomId),
    directRoomIdsFor: async (userId) => {
      const roomIds = (await RoomMembership.find({ user_id: userId }).select('room_id').lean()).map((m) => m.room_id);
      return (await Room.find({ _id: { $in: roomIds }, type: 'direct' }).select('_id').lean()).map((r) => r._id);
    },
    membersOf: async (roomId) =>
      (await RoomMembership.find({ room_id: roomId }).select('user_id').lean()).map((m) => String(m.user_id)),
  });
  const usernamesFor = async (ids) =>
    Object.fromEntries((await User.find({ _id: { $in: ids } }).select('username').lean()).map((u) => [String(u._id), u.username]));
  const jwtAuth = createJwtAuth(authService);

  function registerRoutes(app) {
    app.use('/api/auth', createAuthRouter({ authService }));
    app.use('/api/messages', jwtAuth, createMessagesRouter({ service: messagingService }));
    app.use('/api/rooms', jwtAuth, createRoomsRouter({ service: roomService, messagingService, RoomModel: Room }));
    app.use('/api/users', jwtAuth, createUsersRouter({ UserModel: User }));
  }

  function registerSockets(io) {
    io.use(createSocketJwtAuth(authService));
    const onRoomMessage = createRoomMessageHandler(io, { service: roomService });

    io.on('connection', async (socket) => {
      // Handlers first, synchronously, so no event sent right after connecting is missed.
      socket.use(rateLimitMiddleware(socket, rateLimit));
      socket.join(userRoom(socket.user.id));
      registerRoomHandlers(io, socket, { service: roomService });
      registerMessagingHandlers(io, socket, { service: messagingService, onRoomMessage });
      if (presence) socket.on('disconnect', () => schedulePresence(() => presence.onDisconnect(io, socket), 'disconnect'));

      try {
        // Rejoin the channels of every room this user is a member of (after a reconnect).
        const memberships = await RoomMembership.find({ user_id: socket.user.id }).select('room_id').lean();
        await Promise.all(memberships.map(({ room_id }) => socket.join(socketRoom(String(room_id)))));
        if (presence) await schedulePresence(() => presence.onConnect(io, socket), 'connect');
        await deliverPending(io, socket, { service: messagingService, usernamesFor });
        socket.emit('session:ready', { userId: socket.user.id, username: socket.user.username });
      } catch (err) {
        console.error('connection setup failed', err);
      }
    });
  }

  return { authService, roomService, messagingService, jwtAuth, registerRoutes, registerSockets, drainPresence };
}

module.exports = { createGateway };
