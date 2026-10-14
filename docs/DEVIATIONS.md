# Deviation Log

Every difference between what we built and what the submitted documents (Synopsis, SRS v1.1, SAD v1.0, Test Plan v1.0) say is logged here, so it can be explained at the final demo. Anyone can add a row via a PR; Prithvi maintains the file.

| # | Document & section | What was planned | What we did | Why | Logged |
| --- | --- | --- | --- | --- | --- |
| D-01 | SRS 9.2, Synopsis 10, Test Plan 3 & 12 | Six two-week sprints; features spread over Sprints 1–6 | Two one-week sprints (Sprint 1: 19–23 Oct, Sprint 2: 26–30 Oct) after a dry-run week (13–16 Oct). Sprint 1 = thin end-to-end product (register, login, real-time DM, rooms, persisted history, CI). Sprint 2 = presence, offline delivery, typing, read receipts, room admin/RBAC, security, performance, Docker, docs | Course Part-2 deliverable schedule | 14 Oct |
| D-02 | Test Plan Appendix B (RTM) | Test cases scheduled as "Planned Sprint 3/4/5" | Same tests, re-mapped to Sprint 1 or Sprint 2 (see `docs/RTM.md`) | Follows from D-01 | 14 Oct |
| D-03 | SRS Appendix B (Message entity) | Message fields: message_id, room_id, sender_id, content, timestamp, status | Adds an `idempotencyKey` field (unique per sender) | Needed to implement SAD 3.4.2 (dedup of retried sends); not a behaviour change | 14 Oct |
