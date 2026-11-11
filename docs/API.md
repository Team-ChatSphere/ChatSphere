# ChatSphere API Reference

The REST and WebSocket (Socket.IO) API as implemented. It follows SAD v1.0 §3.2; additions beyond the SAD are marked **(added)** and logged in `DEVIATIONS.md`. A runnable Postman collection is in `docs/postman/` (`cd server && npm run postman`).

- Base URL (local): `http://localhost:4000` (Docker: same; client on `:8080`)
- All bodies are JSON. All times are ISO-8601 UTC.
- Errors, REST and socket alike: `{ "error": { "code": "...", "message": "..." } }` on REST; `{ code, message }` on the socket `error` event and in acks.

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_FAILED` | 400 | Bad or missing input; nothing was changed |
| `AUTH_INVALID_TOKEN` | 401 | Missing / malformed / expired / tampered token, token of a user that no longer exists, or wrong login credentials |
| `AUTH_FORBIDDEN` | 403 | Authenticated but not allowed (e.g. not a member). Never reveals whether the resource exists |
| `NOT_FOUND` | 404 | Unknown route or resource |
| `RATE_LIMITED` | 429 | Too many `message:send` events on this connection (SEC-005) |
| `INTERNAL_ERROR` | 500 | Unexpected error; no internal detail is returned |

## Authentication

1. `POST /api/auth/register`, then `POST /api/auth/login` → `{ token }`.
2. The token is a JWT (HS256) with claims `{ sub: userId, username, iat, exp }`; lifetime `JWT_EXPIRES_IN` (default 12 h).
3. REST: send `Authorization: Bearer <token>`.
4. Socket.IO: connect with `io(url, { auth: { token } })`. A bad token refuses the connection with `connect_error` whose `message` is `AUTH_INVALID_TOKEN` (`err.data` holds `{ code, message }`).

Every check verifies the signature, the expiry **and** that the user still exists.

---

## REST endpoints

### `GET /api/health`
No auth. → `200 { "status": "ok" }`

### `POST /api/auth/register`, FR-001, FR-002, SEC-001
No auth.

```json
{ "username": "alice", "email": "alice@example.com", "password": "Passw0rd!" }
```

| Rule | |
| --- | --- |
| `username` | 3–30 chars: letters, digits, `.`, `_`, `-`; unique **ignoring case** |
| `email` | valid address, ≤ 100 chars; unique ignoring case (stored lower-case) |
| `password` | 8–72 chars; stored only as a bcrypt hash |

→ `201 { "userId": "<24-hex id>" }` · `400 VALIDATION_FAILED` (invalid field, username taken, email registered)

### `POST /api/auth/login`, FR-003
No auth.

```json
{ "usernameOrEmail": "alice", "password": "Passw0rd!" }
```

Username (any case) or email. → `200 { "token": "<jwt>" }` · `400 VALIDATION_FAILED` (missing fields) · `401 AUTH_INVALID_TOKEN` with the **same** message for an unknown user and a wrong password (no account enumeration; failed logins are security-logged, SEC-006).

### `GET /api/messages/:conversationId?page=&pageSize=`, FR-018, FR-015
Bearer token. History of a DM conversation (a 2-member direct room) **or** a group room the caller is a member of.

| Query | Default | Rule |
| --- | --- | --- |
| `page` | 1 | positive integer |
| `pageSize` | 20 | positive integer, capped at 100 |

→ `200`

```json
{
  "messages": [
    { "id": "…", "roomId": "…", "senderId": "…", "content": "two", "timestamp": "2026-11-11T10:01:00.000Z", "status": "read", "idempotencyKey": "…" }
  ],
  "nextPage": 2
}
```

Newest first; `nextPage` is `null` on the last page. `401 AUTH_INVALID_TOKEN` · `403 AUTH_FORBIDDEN` (not a participant, also for unknown ids) · `400 VALIDATION_FAILED` (malformed id / bad paging).

`content` is stored and returned **HTML-escaped** (`&amp; &lt; &gt; &quot; &#39;`, SEC-003). Clients decode those five entities and render the result as plain text.

---

## Socket.IO events

Connect: `io("http://localhost:4000", { auth: { token } })`. After setup the server emits **`session:ready { userId, username }`** **(added)**: the socket is then in its user channel, its room channels, and any missed DMs have been delivered.

Most client→server events accept an optional **ack callback** **(added, D-05/D-06)** answering `{ ok: true, ... }` or `{ ok: false, error: { code, message } }`. Errors are also emitted on the `error` event.

### Messages

| Client → server | Payload | Server → client |
| --- | --- | --- |
| `message:send` (DM), FR-007/008 | `{ toUserId, content, idempotencyKey? }` | `message:new` to **both** participants; `message:status { status: "sent" }` to the sender; ack `{ ok, message }` |
| `message:send` (room), FR-014 | `{ roomId, content, idempotencyKey? }` | `message:new` to every member (`kind: "room"`); ack `{ ok, message }`; `AUTH_FORBIDDEN` for non-members (FR-015) |
| `message:read`, FR-011 | `{ messageId }` | `message:status { messageId, idempotencyKey, status: "read" }` to the sender's tabs; ack `{ ok, status }`. Only the recipient may mark read |

`message:new` payload: `{ id, roomId, senderId, content, timestamp, status, idempotencyKey, kind, senderUsername? }`. `kind` is `"direct"` or `"room"`; DMs also carry `senderUsername` **(added, D-05)**.

**Rules**
- `content`: required, sanitised (SEC-003), stored form ≤ 2000 chars.
- `idempotencyKey`: ≤ 100 chars, unique per sender. Re-sending with the same key returns the original message and is not delivered twice (SAD 3.4.2); reuse it when retrying.
- A DM to yourself is `VALIDATION_FAILED`; an unknown recipient is `NOT_FOUND`.
- **Rate limit** (SEC-005): per connection, burst of 10 `message:send`, refilling 2/s. Over the limit → `RATE_LIMITED`, nothing stored.

**Status lifecycle** (FR-011): `sent` (saved) → `delivered` (recipient connected, immediately or on their next connect) → `read` (`message:read`). Statuses only move forward; each change is sent to all of the sender's tabs as `message:status { messageId, idempotencyKey, status }`.

**Offline delivery** (FR-009): DMs still `sent` when the recipient connects are pushed to them as `message:new` (oldest first) before `session:ready`, then marked `delivered`.

### Typing (FR-010)

| Client → server | Payload | Server → client |
| --- | --- | --- |
| `typing:start` / `typing:stop` | `{ conversationId }` (DM) or `{ roomId }` | `typing:update { conversationId \| roomId, userId, username, typing }` to the other participants only |

Non-participants are ignored. Clients send one `typing:start` per burst and `typing:stop` after 3 s idle; receivers hide an indicator that hasn't been refreshed for 4 s.

### Rooms (FR-012 to FR-016)

| Client → server | Payload | Server → client |
| --- | --- | --- |
| `room:create` | `{ name }` (1–50 chars, unique; `<id>:<id>` is reserved for DMs) | `room:created { roomId, name, type, createdBy }`; creator becomes **admin**; ack `{ ok, room }` |
| `room:join` | `{ roomId }` (group rooms only) | `room:memberJoined { roomId, userId }` to members; `room:joined { roomId, joined }` **(added, D-06)**; ack |
| `room:leave` | `{ roomId }` | `room:memberLeft { roomId, userId }` to members; `room:left { roomId, left }` **(added, D-06)**; all of the user's sockets leave the channel; ack |
| `room:restore` **(added, D-07)** | `{ roomId }` | Re-attaches this socket to a room channel only if the membership still exists (never creates one); ack `{ ok, roomId, joined }` |

On connect the server re-joins the socket to every room the user is a member of.

Room administration (`room:promote`, `room:removeMember`, FR-019 to FR-021), user/room search (CS-33), room history route (CS-40) and presence (`presence:update`, FR-005/006) are documented here as they land.

---

## Security summary

| Requirement | Where |
| --- | --- |
| SEC-001 bcrypt only | `services/auth/authService.js` |
| SEC-002 RBAC on room admin | Room service (CS-38) |
| SEC-003 stored XSS | `utils/sanitize.js` (server) · `utils/text.js` + React text rendering (client) |
| SEC-004 reject bad tokens | `middleware/jwtAuth.js` (REST + handshake) |
| SEC-005 rate limit | `sockets/rateLimit.js` |
| SEC-006 security log | `utils/securityLog.js` (failed logins, rate limiting; room-admin denials via CS-26) |
