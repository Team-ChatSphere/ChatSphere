# Requirement Traceability Matrix

Extends SRS Appendix C and Test Plan v1.1 Appendix B: every requirement → backlog item → Test Plan test case → code → automated tests → result. Paths are relative to the repo root (`server/src`, `server/tests`, `client/src`).

Results come from the Part-3 reports in [`docs/reports/`](reports/): [unit tests](reports/unit-test-report.md) · [code coverage](reports/code-coverage-report.md) · [branch coverage](reports/branch-coverage-report.md) · [system validation](reports/system-validation-report.md) · [load test](reports/load-test.md) · [Postman run](postman/results/README.md).

Status: ✅ implemented and verified · 🟨 implemented, PR in review

Last updated: 12 Nov 2026.

## Functional requirements

| Req | Requirement | Backlog | Test case(s) | Code | Automated tests | Status |
| --- | --- | --- | --- | --- | --- | --- |
| FR-001 | Unique user registration | CS-03, CS-04 | TC-01, TC-02, TC-16 | `services/auth/authService.js` (register), `models/User.js` (case-insensitive unique index), `routes/auth.js` | `services/authService.test.js`, `models/User.test.js`, `routes/auth.test.js`, Postman Auth | ✅ |
| FR-002 | Passwords hashed with bcrypt | CS-03 | TC-01 | `services/auth/authService.js` (bcrypt) | `services/authService.test.js` (stored value is a bcrypt hash, plaintext absent) | ✅ |
| FR-003 | Login issues signed JWT | CS-05 | TC-03, TC-11 | `services/auth/authService.js` (login, signToken), `routes/auth.js` | `services/authService.test.js`, `routes/auth.test.js`, Postman Auth | ✅ |
| FR-004 | WebSocket handshake JWT check | CS-07 | TC-04, TC-23 | `middleware/jwtAuth.js`, `services/auth/authService.js` (authenticate), `gateway.js` | `middleware/jwtAuth.test.js`, `e2e/chatFlow.test.js` | ✅ |
| FR-005 | Broadcast online presence | CS-22 | TC-19 | `services/presence/presenceService.js` (#86) | `e2e/presence.test.js` (#86) | 🟨 |
| FR-006 | Offline presence within 5 s | CS-23 | TC-19 | `services/presence/presenceService.js`, heartbeat in `server.js` (#86) | `e2e/presence.test.js` (#86) | 🟨 |
| FR-007 | Send direct message | CS-09 | TC-05 | `services/messaging/messagingService.js` (sendDirectMessage), `sockets/messagingHandlers.js`, `client/src/hooks/useDirectMessages.js` | `services/messagingService.test.js`, `sockets/messagingHandlers.test.js`, `e2e/chatFlow.test.js`, `client/.../DirectConversation.test.jsx` | ✅ |
| FR-008 | Real-time delivery when online | CS-09 | TC-05 | `sockets/messagingHandlers.js` (`message:new` to `user:<id>`), `gateway.js` | `e2e/chatFlow.test.js` (live DM between two clients, < 300 ms) | ✅ |
| FR-009 | Deliver to offline recipient | CS-29 | TC-06 | `sockets/messagingHandlers.js` (deliverPending), `messagingService.js` (pendingFor, markDelivered) | `e2e/messageLifecycle.test.js`, `services/messageLifecycle.test.js` | ✅ |
| FR-010 | Typing indicator | CS-30 | TC-13 | `sockets/messagingHandlers.js` (typing), `messagingService.js` (typingTargets), `client/src/hooks/useDirectMessages.js` | `e2e/messageLifecycle.test.js`, `client/.../DirectConversation.test.jsx` | ✅ |
| FR-011 | Message status sent/delivered/read | CS-31 | TC-12 | `messagingService.js` (markDelivered, markRead), `sockets/messagingHandlers.js`, client ticks | `e2e/messageLifecycle.test.js`, `services/messageLifecycle.test.js`, `client/.../DirectConversation.test.jsx` | ✅ |
| FR-012 | Create room, creator is first admin | CS-18 | TC-07 | `services/rooms/roomService.js` (createRoom), `sockets/roomHandlers.js` | `services/roomService.test.js`, `sockets/roomHandlers.test.js`, `e2e/chatFlow.test.js` | ✅ |
| FR-013 | Join / leave room | CS-19 | TC-17 | `roomService.js` (joinRoom, leaveRoom, restoreRoom), `sockets/roomHandlers.js`, `gateway.js` (rejoin on connect) | `services/roomService.test.js`, `services/restoreRoom.test.js`, `e2e/chatFlow.test.js` | ✅ |
| FR-014 | Broadcast group message | CS-20 | TC-07 | `roomService.js` (sendRoomMessage), `sockets/roomHandlers.js` (createRoomMessageHandler) | `sockets/roomHandlers.test.js`, `e2e/chatFlow.test.js` | ✅ |
| FR-015 | Only members view/send in room | CS-21, CS-40 | TC-18, TC-10 | `roomService.js` (membership check), `messagingService.js` (getHistory), room history route (#86) | `services/roomService.test.js`, `e2e/chatFlow.test.js`, `services/messageHistory.test.js` | ✅ send / 🟨 room route |
| FR-016 | Room keeps ≥ 1 admin | CS-39 | TC-21 | `roomService.js` (leaveRoom / removeMember guard) (#86) | `services/roomService.test.js` (#86) | 🟨 |
| FR-017 | Persist every message | CS-10, CS-11 | TC-05, TC-06, TC-14 | `models/Message.js`, `messagingService.js` (persist before ack, idempotency), `services/messaging/directRoom.js`, `roomService.js` | `models/Message.test.js`, `services/messagingService.test.js`, `services/directRoom.test.js`, `services/directMessagingIntegration.test.js` | ✅ |
| FR-018 | Paginated history | CS-12, CS-40 | TC-10 | `messagingService.js` (getHistory), `routes/messages.js`, `client/src/hooks/useDirectMessages.js` | `services/messageHistory.test.js`, `routes/messages.test.js`, `e2e/chatFlow.test.js`, Postman DM history | ✅ |
| FR-019 | Admin promotes a member | CS-36 | TC-20 | `roomService.js` (promoteMember), `roomHandlers.js` (#86) | `services/roomService.test.js`, `sockets/roomHandlers.test.js` (#86) | 🟨 |
| FR-020 | Admin removes a member | CS-37 | TC-20 | `roomService.js` (removeMember), `roomHandlers.js` (#86) | as FR-019 (#86) | 🟨 |
| FR-021 | Reject non-admin admin actions | CS-38 | TC-08 | `roomService.js` (requireAdmin) (#86) | as FR-019 (#86) | 🟨 |

## Non-functional and security requirements

| Req | Requirement | Backlog | Test case(s) | Code / evidence | Automated tests | Status |
| --- | --- | --- | --- | --- | --- | --- |
| NFR-001 | 95% delivery ≤ 300 ms | CS-34 | TC-05 | Load test: **p95 16.2 ms**, 1000 DMs, 0 lost ([report](reports/load-test.md)) | `server/scripts/loadTest.js`, `e2e/chatFlow.test.js` latency check | ✅ |
| NFR-002 | 95% REST ≤ 1 s | CS-34 | TC-22 | Load test: **p95 66.1 ms**, 500 requests, 0 errors; Postman timing assertions | `server/scripts/loadTest.js`, Postman | ✅ |
| SEC-001 | No plaintext passwords | CS-03 | TC-01 | bcrypt only; hash stripped from JSON (`models/User.js`) | `services/authService.test.js`, `models/User.test.js` | ✅ |
| SEC-002 | RBAC on room-admin actions | CS-38, CS-27 | TC-08 | `roomService.js` (requireAdmin) (#86) | (#86) | 🟨 |
| SEC-003 | Sanitise content (stored XSS) | CS-32 | TC-09 | `utils/sanitize.js` (server, DMs + rooms), `client/src/utils/text.js` + React text rendering | `utils/sanitize.test.js`, `e2e/messageLifecycle.test.js`, `client/.../DirectConversation.test.jsx` | ✅ |
| SEC-004 | Reject expired/invalid JWTs | CS-07, CS-27 | TC-04, TC-23 | `middleware/jwtAuth.js`, `authService.js` (verifyToken, authenticate) | `services/authService.test.js` (expired, tampered, wrong key, `alg:none`, deleted user), `middleware/jwtAuth.test.js`, `e2e/chatFlow.test.js`, Postman | ✅ |
| SEC-005 | Rate-limit message sending | CS-25, CS-27 | TC-15 | `sockets/rateLimit.js` | `sockets/rateLimit.test.js`, `e2e/rateLimit.test.js` | ✅ |
| SEC-006 | Log security events | CS-26 | TC-11, TC-15, TC-08 | `utils/securityLog.js`: failed logins, rate limiting, room-admin denials (#86) | `services/authService.test.js`, `sockets/rateLimit.test.js`, room-admin logging (#86) | ✅ login + rate limit / 🟨 room admin |
