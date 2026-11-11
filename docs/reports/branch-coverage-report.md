# Branch Coverage Report

**Date:** 2026-11-11 · **Tools:** Jest coverage (server) · Vitest coverage-v8 (client) · **HTML:** [server](coverage-html/server/index.html) · [client](coverage-html/client/index.html)

Branch coverage counts each outcome of every decision point (`if`/`else`, `? :`, `&&`/`||`, `??`, default parameters, `switch` cases).

| Part | Branches covered | Branch coverage |
| --- | --- | --- |
| Server | 268/327 | **82.0%** |
| Client | 211/357 | **59.1%** |

## Server, per file

| File | Branches covered | Branch % |
| --- | --- | --- |
| `src/app.js` | 8/9 | 88.9% |
| `src/config.js` | 9/10 | 90.0% |
| `src/gateway.js` | 2/5 | 40.0% |
| `src/index.js` | 0/0 | 100.0% |
| `src/middleware/jwtAuth.js` | 6/6 | 100.0% |
| `src/models/Message.js` | 2/2 | 100.0% |
| `src/models/Room.js` | 2/2 | 100.0% |
| `src/models/RoomMembership.js` | 2/2 | 100.0% |
| `src/models/User.js` | 2/2 | 100.0% |
| `src/routes/auth.js` | 2/4 | 50.0% |
| `src/routes/messages.js` | 4/4 | 100.0% |
| `src/server.js` | 2/3 | 66.7% |
| `src/services/auth/authService.js` | 50/55 | 90.9% |
| `src/services/messaging/directRoom.js` | 10/14 | 71.4% |
| `src/services/messaging/messagingService.js` | 62/66 | 93.9% |
| `src/services/rooms/roomService.js` | 47/67 | 70.1% |
| `src/sockets/messagingHandlers.js` | 29/33 | 87.9% |
| `src/sockets/rateLimit.js` | 11/12 | 91.7% |
| `src/sockets/roomHandlers.js` | 15/26 | 57.7% |
| `src/utils/errors.js` | 3/4 | 75.0% |
| `src/utils/sanitize.js` | 0/0 | 100.0% |
| `src/utils/securityLog.js` | 0/1 | 0.0% |

## Client, per file

| File | Branches covered | Branch % |
| --- | --- | --- |
| `src/api/client.js` | 18/18 | 100.0% |
| `src/App.jsx` | 4/4 | 100.0% |
| `src/components/DirectConversation.jsx` | 32/40 | 80.0% |
| `src/components/RoomsPanel.jsx` | 0/67 | 0.0% |
| `src/hooks/useDirectMessages.js` | 80/93 | 86.0% |
| `src/main.jsx` | 0/0 | 100.0% |
| `src/state/AuthContext.jsx` | 17/21 | 81.0% |
| `src/state/recentDms.js` | 8/8 | 100.0% |
| `src/state/SocketContext.jsx` | 8/8 | 100.0% |
| `src/utils/text.js` | 1/2 | 50.0% |
| `src/views/AuthPage.jsx` | 0/34 | 0.0% |
| `src/views/Dashboard.jsx` | 43/62 | 69.3% |

## Uncovered branches (line numbers)

Where at least one outcome of a branch never ran. Most are defensive paths (unexpected database errors, missing optional arguments).

| File | Lines |
| --- | --- |
| `src/app.js` | 12 |
| `src/config.js` | 19 |
| `src/gateway.js` | 25, 58, 66 |
| `src/routes/auth.js` | 9, 18 |
| `src/server.js` | 13 |
| `src/services/auth/authService.js` | 35, 36, 58, 59, 79 |
| `src/services/messaging/directRoom.js` | 23, 50, 52 |
| `src/services/messaging/messagingService.js` | 33, 56, 104, 114 |
| `src/services/rooms/roomService.js` | 32, 66, 77, 79, 93, 101, 112, 121, 122, 127, 143, 145 |
| `src/sockets/messagingHandlers.js` | 16, 34, 65, 66 |
| `src/sockets/rateLimit.js` | 41 |
| `src/sockets/roomHandlers.js` | 9, 11, 25, 36, 39, 51, 61, 69, 72, 89, 95 |
| `src/utils/errors.js` | 15 |
| `src/utils/securityLog.js` | 3 |
| `src/components/DirectConversation.jsx` | 30, 66, 72, 90, 120 |
| `src/components/RoomsPanel.jsx` | 10, 11, 19, 21, 22, 36, 37, 49, 56, 72, 78, 79, 81, 87, 99, 109, 113, 118, 120, 126, 139, 157, 180, 190, 193, 198, 200, 201, 205 |
| `src/hooks/useDirectMessages.js` | 11, 14, 17, 65, 94, 100, 109, 110, 136, 158, 170, 187 |
| `src/state/AuthContext.jsx` | 13, 14 |
| `src/utils/text.js` | 7 |
| `src/views/AuthPage.jsx` | 14, 25, 52, 53, 55, 60, 61, 64, 66, 68, 72, 73 |
| `src/views/Dashboard.jsx` | 46, 51, 58, 60, 89, 99, 101, 106, 107, 110, 128, 129, 130, 135, 138 |
