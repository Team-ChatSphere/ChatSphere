# Branch Coverage Report

**Date:** 2026-11-11 · **Tools:** Jest coverage (server) · Vitest coverage-v8 (client) · **HTML:** [server](coverage-html/server/index.html) · [client](coverage-html/client/index.html)

Branch coverage counts each outcome of every decision point (`if`/`else`, `? :`, `&&`/`||`, `??`, default parameters, `switch` cases).

| Part | Branches covered | Branch coverage |
| --- | --- | --- |
| Server | 334/435 | **76.8%** |
| Client | 339/461 | **73.5%** |

## Server, per file

| File | Branches covered | Branch % |
| --- | --- | --- |
| `src/app.js` | 8/9 | 88.9% |
| `src/config.js` | 9/10 | 90.0% |
| `src/gateway.js` | 4/5 | 80.0% |
| `src/index.js` | 0/2 | 0.0% |
| `src/middleware/jwtAuth.js` | 6/6 | 100.0% |
| `src/models/Message.js` | 2/2 | 100.0% |
| `src/models/Room.js` | 2/2 | 100.0% |
| `src/models/RoomMembership.js` | 2/2 | 100.0% |
| `src/models/User.js` | 2/2 | 100.0% |
| `src/routes/auth.js` | 2/4 | 50.0% |
| `src/routes/messages.js` | 4/4 | 100.0% |
| `src/routes/rooms.js` | 10/25 | 40.0% |
| `src/routes/users.js` | 9/14 | 64.3% |
| `src/server.js` | 2/3 | 66.7% |
| `src/services/auth/authService.js` | 50/55 | 90.9% |
| `src/services/messaging/directRoom.js` | 10/14 | 71.4% |
| `src/services/messaging/messagingService.js` | 62/66 | 93.9% |
| `src/services/presence/presenceService.js` | 15/20 | 75.0% |
| `src/services/rooms/roomService.js` | 74/106 | 69.8% |
| `src/sockets/messagingHandlers.js` | 29/33 | 87.9% |
| `src/sockets/rateLimit.js` | 11/12 | 91.7% |
| `src/sockets/roomHandlers.js` | 18/34 | 52.9% |
| `src/utils/errors.js` | 3/4 | 75.0% |
| `src/utils/sanitize.js` | 0/0 | 100.0% |
| `src/utils/securityLog.js` | 0/1 | 0.0% |

## Client, per file

| File | Branches covered | Branch % |
| --- | --- | --- |
| `src/api/client.js` | 18/18 | 100.0% |
| `src/App.jsx` | 4/4 | 100.0% |
| `src/components/DirectConversation.jsx` | 32/40 | 80.0% |
| `src/components/RoomsPanel.jsx` | 74/135 | 54.8% |
| `src/hooks/useDirectMessages.js` | 80/93 | 86.0% |
| `src/main.jsx` | 0/0 | 100.0% |
| `src/state/AuthContext.jsx` | 17/21 | 81.0% |
| `src/state/recentDms.js` | 8/8 | 100.0% |
| `src/state/SocketContext.jsx` | 8/8 | 100.0% |
| `src/utils/text.js` | 1/2 | 50.0% |
| `src/views/AuthPage.jsx` | 32/50 | 64.0% |
| `src/views/Dashboard.jsx` | 65/82 | 79.3% |

## Uncovered branches (line numbers)

Where at least one outcome of a branch never ran. Most are defensive paths (unexpected database errors, missing optional arguments).

| File | Lines |
| --- | --- |
| `src/app.js` | 12 |
| `src/config.js` | 19 |
| `src/gateway.js` | 27 |
| `src/index.js` | 38 |
| `src/routes/auth.js` | 9, 18 |
| `src/routes/rooms.js` | 7, 12, 13, 14, 15, 20, 21, 35, 36, 45, 46 |
| `src/routes/users.js` | 5, 10, 13, 20, 21 |
| `src/server.js` | 13 |
| `src/services/auth/authService.js` | 35, 36, 58, 59, 79 |
| `src/services/messaging/directRoom.js` | 23, 50, 52 |
| `src/services/messaging/messagingService.js` | 33, 56, 104, 114 |
| `src/services/presence/presenceService.js` | 17, 18, 27, 44, 54 |
| `src/services/rooms/roomService.js` | 33, 71, 72, 108, 119, 121, 135, 143, 147, 150, 165, 166, 182, 183, 196, 200, 208, 210, 220, 229, 230, 235, 251, 253 |
| `src/sockets/messagingHandlers.js` | 16, 34, 65, 66 |
| `src/sockets/rateLimit.js` | 41 |
| `src/sockets/roomHandlers.js` | 9, 11, 25, 36, 39, 51, 61, 69, 72, 87, 102, 108, 113, 130, 136 |
| `src/utils/errors.js` | 15 |
| `src/utils/securityLog.js` | 3 |
| `src/components/DirectConversation.jsx` | 30, 66, 72, 90, 120 |
| `src/components/RoomsPanel.jsx` | 13, 21, 23, 24, 46, 57, 61, 63, 70, 75, 79, 80, 84, 117, 124, 141, 147, 148, 150, 156, 164, 184, 198, 202, 204, 217, 222, 224, 230, 243, 270, 272, 283, 286, 293, 295, 301, 323, 341, 344, 351 |
| `src/hooks/useDirectMessages.js` | 11, 14, 17, 65, 94, 100, 109, 110, 136, 158, 170, 187 |
| `src/state/AuthContext.jsx` | 13, 14 |
| `src/utils/text.js` | 7 |
| `src/views/AuthPage.jsx` | 12, 25, 34, 47, 74, 75, 82, 83, 86, 90, 94, 95 |
| `src/views/Dashboard.jsx` | 47, 70, 71, 75, 82, 89, 91, 135, 145, 147, 153, 154, 189 |
