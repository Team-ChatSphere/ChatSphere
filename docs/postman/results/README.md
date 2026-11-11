# Postman / newman run

Run: 2026-11-11T19:13:01.485Z · server: local server, in-memory MongoDB (`npm run postman`)

**Requests:** 15 (0 failed) · **Assertions:** 34 (0 failed) · **Average response:** 5 ms

| Request | Method | Status | Time | Assertions passed | Result |
| --- | --- | --- | --- | --- | --- |
| Health check | GET | 200 | 25 ms | 3/3 | PASS |
| Register (FR-001, FR-002, TC-01) | POST | 201 | 8 ms | 3/3 | PASS |
| Register duplicate email is rejected (TC-02) | POST | 400 | 4 ms | 2/2 | PASS |
| Register short password is rejected (SEC-001) | POST | 400 | 3 ms | 2/2 | PASS |
| Login (FR-003, TC-03) | POST | 200 | 5 ms | 3/3 | PASS |
| Login with wrong password (401) | POST | 401 | 5 ms | 2/2 | PASS |
| Login with unknown user gives the same 401 | POST | 401 | 5 ms | 2/2 | PASS |
| Login as the DM participant | POST | 200 | 5 ms | 1/1 | PASS |
| Get DM history (FR-018, TC-10) | GET | 200 | 6 ms | 4/4 | PASS |
| Get DM history, page size 1 has a next page | GET | 200 | 4 ms | 2/2 | PASS |
| Get DM history without token (SEC-004, TC-04) | GET | 401 | 2 ms | 2/2 | PASS |
| Get DM history with a tampered token (SEC-004) | GET | 401 | 1 ms | 2/2 | PASS |
| Get DM history of a conversation I am not in (FR-015) | GET | 403 | 3 ms | 2/2 | PASS |
| Get DM history with bad pageSize | GET | 400 | 2 ms | 2/2 | PASS |
| Get DM history with a malformed id | GET | 400 | 2 ms | 2/2 | PASS |

Raw output: `newman-results.json` (full) and `newman-results.xml` (JUnit).
