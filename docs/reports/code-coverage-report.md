# Code Coverage Report

**Date:** 2026-11-11 · **Tools:** Jest coverage (server, istanbul) · Vitest coverage-v8 (client) · **HTML:** [server](coverage-html/server/index.html) · [client](coverage-html/client/index.html)

| Part | Statements | Lines | Functions | Branches |
| --- | --- | --- | --- | --- |
| Server (`server/src`) | 88.7% | 91.8% | 94.9% | 76.8% |
| Client (`client/src`) | 78.9% | 84.3% | 75.4% | 73.5% |

Branch coverage is reported in detail in [branch-coverage-report.md](branch-coverage-report.md).

## Server, per file

| File | Statements | Lines | Functions |
| --- | --- | --- | --- |
| `src/app.js` | 100.0% | 100.0% | 100.0% |
| `src/config.js` | 100.0% | 100.0% | 100.0% |
| `src/gateway.js` | 95.5% | 96.3% | 95.2% |
| `src/index.js` | 0.0% | 0.0% | 0.0% |
| `src/middleware/jwtAuth.js` | 100.0% | 100.0% | 100.0% |
| `src/models/Message.js` | 100.0% | 100.0% | 100.0% |
| `src/models/Room.js` | 100.0% | 100.0% | 100.0% |
| `src/models/RoomMembership.js` | 100.0% | 100.0% | 100.0% |
| `src/models/User.js` | 100.0% | 100.0% | 100.0% |
| `src/routes/auth.js` | 100.0% | 100.0% | 100.0% |
| `src/routes/messages.js` | 100.0% | 100.0% | 100.0% |
| `src/routes/rooms.js` | 72.2% | 85.7% | 100.0% |
| `src/routes/users.js` | 90.9% | 100.0% | 100.0% |
| `src/server.js` | 100.0% | 100.0% | 100.0% |
| `src/services/auth/authService.js` | 97.0% | 98.3% | 100.0% |
| `src/services/messaging/directRoom.js` | 85.2% | 95.8% | 80.0% |
| `src/services/messaging/messagingService.js` | 95.3% | 97.3% | 100.0% |
| `src/services/presence/presenceService.js` | 89.7% | 100.0% | 100.0% |
| `src/services/rooms/roomService.js` | 84.8% | 90.5% | 100.0% |
| `src/sockets/messagingHandlers.js` | 98.4% | 100.0% | 100.0% |
| `src/sockets/rateLimit.js` | 100.0% | 100.0% | 100.0% |
| `src/sockets/roomHandlers.js` | 89.6% | 90.0% | 100.0% |
| `src/utils/errors.js` | 100.0% | 100.0% | 100.0% |
| `src/utils/sanitize.js` | 100.0% | 100.0% | 100.0% |
| `src/utils/securityLog.js` | 100.0% | 100.0% | 100.0% |

## Client, per file

| File | Statements | Lines | Functions |
| --- | --- | --- | --- |
| `src/api/client.js` | 100.0% | 100.0% | 100.0% |
| `src/App.jsx` | 100.0% | 100.0% | 100.0% |
| `src/components/DirectConversation.jsx` | 88.9% | 96.0% | 88.9% |
| `src/components/RoomsPanel.jsx` | 58.1% | 66.1% | 54.3% |
| `src/hooks/useDirectMessages.js` | 94.2% | 99.1% | 93.9% |
| `src/main.jsx` | 0.0% | 0.0% | 100.0% |
| `src/state/AuthContext.jsx` | 97.5% | 97.2% | 100.0% |
| `src/state/recentDms.js` | 91.7% | 88.9% | 100.0% |
| `src/state/SocketContext.jsx` | 100.0% | 100.0% | 100.0% |
| `src/utils/text.js` | 100.0% | 100.0% | 100.0% |
| `src/views/AuthPage.jsx` | 87.2% | 90.9% | 100.0% |
| `src/views/Dashboard.jsx` | 83.8% | 86.3% | 78.4% |

Notes: `server/src/index.js` (process start-up: connect MongoDB, listen, signal handling) is exercised by the Docker and manual smoke runs rather than unit tests; everything it wires is covered through `gateway.js` in the end-to-end suites. Client entry `main.jsx` is the same.
