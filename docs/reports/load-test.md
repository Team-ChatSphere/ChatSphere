# Load Test Report (NFR-001, NFR-002)

**Backlog:** CS-34 · **Test Plan:** TC-05 (performance part), §6 · **Script:** `server/scripts/loadTest.js` (`cd server && npm run loadtest`) · **Raw data:** `load-test.json`

## Setup

| | |
| --- | --- |
| Date | 2026-11-11 |
| Machine | AMD Ryzen 7 260 w/ Radeon 780M Graphics, 16 cores, 23 GB RAM, Node v24.20.0 |
| System under test | Full ChatSphere server (Express + Socket.IO + all services) with MongoDB (in-memory), started by the script |
| Users | 100 registered users, all connected over WebSocket |
| DM load | 50 senders → 50 receivers, 20 DMs each, one every 600 ms (inside the SEC-005 limit), **1000 DMs** in total, ~67.9 msg/s |
| REST load | 500 authenticated `GET /api/messages/:conversationId` requests, 25 in parallel |

Delivery latency is measured from the sender emitting `message:send` to the recipient receiving `message:new` (includes JWT-authenticated socket, validation, sanitising, MongoDB write, direct-room lookup and broadcast). REST time is the full HTTP round trip.

## Results

### NFR-001: message delivery (target: 95% ≤ 300 ms)

| Messages | Min (ms) | Mean | p50 | p95 | p99 | Max |
| --- | --- | --- | --- | --- | --- | --- |
| 1000 | 3.3 | 9.4 | 8.9 | **16.2** | 20.6 | 35.9 |

Lost messages: **0**. **Result: PASS** (p95 16.2 ms vs 300 ms target).

### NFR-002: REST response time (target: 95% ≤ 1 s)

| Requests | Min (ms) | Mean | p50 | p95 | p99 | Max |
| --- | --- | --- | --- | --- | --- | --- |
| 500 | 22.3 | 46.6 | 42.8 | **66.1** | 71.8 | 84.1 |

Errors: **0**. **Result: PASS** (p95 66.1 ms vs 1000 ms target).

## Notes and limits

- Client and server run on the same machine, so network latency is near zero; on a real network add the round-trip time. The margin (p95 16.2 ms vs 300 ms) leaves room for that.
- MongoDB runs in memory for repeatability; a disk-backed MongoDB (e.g. the `docker compose` stack) adds write latency but stays well inside the budget for this load.
- Single server instance, as scoped in SRS §2.6; horizontal scaling (Redis adapter) is out of scope for this phase.
- Re-run with a bigger load: `USERS=200 MESSAGES=30 npm run loadtest`.
