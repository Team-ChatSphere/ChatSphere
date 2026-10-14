# Integration Contract (Sprint 1)

How the three services plug together so each of us can build against the others before their code is merged. It refines SAD 3.2 and 3.4.3 and doesn't change any public API. If you need something different, comment on this file's PR or open a PR that changes it, so we all agree before coding.

## 1. Authenticated user (Sourish, CS-07)

The JWT Auth Middleware sets the same shape on both channels:

```js
req.user    = { id: '<24-hex ObjectId string>', username: 'alice' }   // REST
socket.user = { id: '<24-hex ObjectId string>', username: 'alice' }   // Socket.IO
```

* `id` is a **string**, not an ObjectId.
* REST: a missing/expired/invalid token is a `401 { error: { code: 'AUTH_INVALID_TOKEN', message } }` and the route is never called.
* Socket.IO: reject in `io.use(...)` with `next(new Error('AUTH_INVALID_TOKEN'))`; the token arrives in `socket.handshake.auth.token`.

## 2. Gateway wiring (Sourish, CS-01 / CS-07)

On every authenticated connection the gateway **joins the socket to a per-user room** and registers each service's handlers:

```js
const { registerMessagingHandlers } = require('./sockets/messagingHandlers');
const { registerRoomHandlers, createRoomMessageHandler } = require('./sockets/roomHandlers');
const { createRoomService } = require('./services/rooms/roomService');
const RoomMembership = require('./models/RoomMembership');
const roomService = createRoomService();

io.on('connection', async (socket) => {
  socket.join(`user:${socket.user.id}`);   // DMs and presence are delivered to this room
  const onRoomMessage = createRoomMessageHandler(io, { service: roomService });
  registerRoomHandlers(io, socket, { service: roomService });
  registerMessagingHandlers(io, socket, { service: messagingService, onRoomMessage });
  // Rejoin existing group channels after reconnecting. The room:join handler
  // also authorizes and joins newly joined members.
  const memberships = await RoomMembership.find({ user_id: socket.user.id }).select('room_id').lean();
  await Promise.all(memberships.map(({ room_id }) => socket.join(`room:${room_id}`)));
});
```

`createRoomMessageHandler` and `registerRoomHandlers` are exported from
`server/src/sockets/roomHandlers.js`. The former is passed to
`registerMessagingHandlers` so the existing `message:send` listener can route
`{ roomId, content }` group messages without registering a second listener.
`registerRoomHandlers` handles `room:create`, `room:join`, and `room:leave`.

REST mounting:

```js
const { createMessagesRouter } = require('./routes/messages');
app.use(express.json());
app.use('/api/auth', authRouter);                                         // no JWT
app.use('/api/messages', jwtAuth, createMessagesRouter({ service: messagingService }));
app.use('/api/rooms', jwtAuth, roomsRouter);
```

Building the messaging service (dependencies are injected so each service stays testable, SAD 3.4.3):

```js
const { createMessagingService } = require('./services/messaging/messagingService');
const messagingService = createMessagingService({
  resolveDirectRoom: getOrCreateDirectRoom,                     // section 4
  userExists: async (id) => Boolean(await User.exists({ _id: id })),
  isMember: async (userId, roomId) => Boolean(await RoomMembership.exists({ room_id: roomId, user_id: userId })),
});
```

## 3. Errors (everyone)

Use `server/src/utils/errors.js`:

```js
const { AppError, toErrorBody } = require('../utils/errors');
throw new AppError('AUTH_FORBIDDEN', 'Only room admins can remove members');
```

* REST: `res.status(err.status).json({ error: toErrorBody(err) })`.
* Socket.IO: `socket.emit('error', toErrorBody(err))`, and call the ack with `{ ok: false, error }` if the client passed one.
* Codes: `VALIDATION_FAILED` 400, `AUTH_INVALID_TOKEN` 401, `AUTH_FORBIDDEN` 403, `NOT_FOUND` 404, `RATE_LIMITED` 429, `INTERNAL_ERROR` 500. Never put internal detail in `INTERNAL_ERROR`.

## 4. Room and RoomMembership models (Satvik, CS-17)

DMs reuse Rooms (SRS Appendix B), so the Messaging service needs these exact field names:

```js
// server/src/models/Room.js
{
  name:       { type: String, required: true, unique: true, maxlength: 50, trim: true },
  type:       { type: String, enum: ['direct', 'group'], required: true },
  created_by: { type: ObjectId, ref: 'User', required: true },
}

// server/src/models/RoomMembership.js
{
  room_id: { type: ObjectId, ref: 'Room', required: true },
  user_id: { type: ObjectId, ref: 'User', required: true },
  role:    { type: String, enum: ['member', 'admin'], default: 'member' },
}
// unique index { room_id: 1, user_id: 1 }
```

**Direct rooms** are named `<smallerUserId>:<largerUserId>` (the two id strings sorted, 49 chars), so they fit the unique ≤ 50-char name rule with no schema change. To stop a group from taking that name, the Room service rejects group names matching `/^[0-9a-f]{24}:[0-9a-f]{24}$/i` with `VALIDATION_FAILED`. Both members get role `member`. Direct rooms never appear in room search and can't be joined with `room:join`.

Prithvi writes `getOrCreateDirectRoom(userA, userB)` (CS-10) on top of these models once they're merged.

## 5. Group messages (Satvik, CS-20)

There is **one** `message:send` listener, registered by `registerMessagingHandlers`. A payload with `roomId` is passed to the `onRoomMessage(socket, payload, ack)` function you provide; one with `toUserId` is a DM. Store group messages with the same `Message` model (`server/src/models/Message.js`) and send clients the same shape (`toMessageDto` in `messagingService.js`):

```js
{ id, roomId, senderId, content, timestamp, status, idempotencyKey }
```

Broadcast on the Socket.IO room `room:<roomId>` (sockets join it on `room:join` / on connect for rooms they're in).

The room service checks membership before saving a group message. The
`GET /api/messages/:conversationId` service already checks membership before
returning history, so non-members cannot read group messages either.

## 6. Client (Satvik, CS-16 → Prithvi, CS-13)

The DM view needs these from the app shell:

* `AuthContext` providing `{ token, user: { id, username } }`.
* `SocketContext` providing one connected Socket.IO client, created with `io(URL, { auth: { token } })`.
* An API helper that adds `Authorization: Bearer <token>`.
* Dashboard right panel renders `<DirectConversation peer={{ id, username }} conversationId={roomId | null} />` when a DM is selected (`conversationId` is null for a brand-new DM; it's filled in from the first `message:new`).

## 7. Client → server message flow (reference)

```
client: message:send { toUserId, content, idempotencyKey: crypto.randomUUID() }
server: saves Message (status 'sent')
server → user:<to>, user:<from>:  message:new  { id, roomId, senderId, content, timestamp, status, idempotencyKey,
                                                 kind: 'direct', senderUsername }
server → sender socket:           message:status { messageId, idempotencyKey, status: 'sent' }
server → sender ack callback:     { ok: true, message } | { ok: false, error: { code, message } }
on failure → sender socket:       error { code, message }
```

Clients should reuse the same `idempotencyKey` when retrying after a dropped connection.

`kind: 'direct'` and `senderUsername` are only on DM `message:new` events, so the dashboard can add a DM from someone new to its list (there is no user lookup API until CS-33). Group messages (CS-20) should send `kind: 'room'`.
