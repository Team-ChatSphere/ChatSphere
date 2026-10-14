# Requirement Traceability Matrix (working copy)

Extends SRS Appendix C / Test Plan Appendix B. Updated as code and tests land; "Code" and "Tests" columns point at files in this repo.

Status: ⬜ not started · 🟨 in progress · ✅ done

| Req ID | Requirement | Backlog | Sprint | Test case(s) | Code | Tests | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FR-001 | Unique user registration | CS-03 | 1 | TC-01, TC-02 | | | ⬜ |
| FR-002 | Passwords hashed with bcrypt | CS-03 | 1 | Code review (SEC-001) | | | ⬜ |
| FR-003 | Login issues signed JWT | CS-05 | 1 | TC-03 | | | ⬜ |
| FR-004 | WebSocket handshake JWT check | CS-07 | 1 | TC-04 | | | ⬜ |
| FR-005 | Broadcast online presence | CS-22 | 2 | Integration test | | | ⬜ |
| FR-006 | Broadcast offline presence within 5 s | CS-23 | 2 | Integration test | | | ⬜ |
| FR-007 | Send direct message | CS-09 | 1 | TC-05 | | | ⬜ |
| FR-008 | Real-time delivery when online | CS-09 | 1 | TC-05 | | | ⬜ |
| FR-009 | Queue & deliver to offline recipient | CS-29 | 2 | TC-06 | | | ⬜ |
| FR-010 | Typing indicator | CS-30 | 2 | Functional test | | | ⬜ |
| FR-011 | Message status sent/delivered/read | CS-31 | 2 | TC-05, TC-06 (status observed) | | | ⬜ |
| FR-012 | Create room, creator is first admin | CS-18 | 1 | TC-07 | | | ⬜ |
| FR-013 | Join / leave room | CS-19 | 1 | Functional test | | | ⬜ |
| FR-014 | Broadcast group message | CS-20 | 1 | TC-07 | | | ⬜ |
| FR-015 | Only members can view/send in room | CS-21, CS-40 | 1, 2 | Negative/security test | | | ⬜ |
| FR-016 | Room always retains ≥ 1 admin | CS-39 | 2 | Negative test | | | ⬜ |
| FR-017 | Persist every message | CS-10, CS-11 | 1 | TC-05, TC-06 (persistence implied) | | | ⬜ |
| FR-018 | Paginated history retrieval | CS-12, CS-40 | 1, 2 | TC-10 | | | ⬜ |
| FR-019 | Admin promotes a member | CS-36 | 2 | Functional test | | | ⬜ |
| FR-020 | Admin removes a member | CS-37 | 2 | TC-08 (authorized path) | | | ⬜ |
| FR-021 | Reject non-admin admin actions | CS-38 | 2 | TC-08 | | | ⬜ |
| NFR-001 | 95% message delivery ≤ 300 ms | CS-34 | 2 | TC-05, load test | | | ⬜ |
| NFR-002 | 95% REST response ≤ 1 s | CS-34 | 2 | Load test | | | ⬜ |
| SEC-001 | No plaintext passwords | CS-03 | 1 | Code review | | | ⬜ |
| SEC-002 | RBAC on room-admin actions | CS-38, CS-27 | 2 | TC-08 | | | ⬜ |
| SEC-003 | Sanitize message content (XSS) | CS-32 | 2 | TC-09 | | | ⬜ |
| SEC-004 | Reject expired/invalid JWTs | CS-07, CS-27 | 1, 2 | TC-04 | | | ⬜ |
| SEC-005 | Rate-limit message-send events | CS-25, CS-27 | 2 | Load/security test | | | ⬜ |
| SEC-006 | Log security-relevant events | CS-26 | 2 | System test / code review | | | ⬜ |
