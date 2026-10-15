# ChatSphere

Real-time direct and group messaging web app: Team 16, PES University, UE24CS341A (Software Engineering).
Node.js 20 + Express + Socket.IO, React, MongoDB 6, Redis 7.

## Run locally

Needs Node.js 20+ and a MongoDB you can reach (local install, Docker, or Atlas).

```bash
# Server: http://localhost:4000
cd server
cp .env.example .env        # then set MONGO_URI and JWT_SECRET
npm install
npm run dev

# Client: http://localhost:5173 (second terminal)
cd client
cp .env.example .env
npm install
npm run dev
```

## Tests

```bash
cd server && npm run lint && npm test   # Jest
cd client && npm test && npm run build  # Vitest
```

CI runs the same on every PR and push to `develop` / `main`.

## Docs

- `docs/`: SRS v1.1, SAD v1.0, Test Plan v1.0, integration contract (`INTEGRATION.md`), RTM, deviation log, Postman collection
- Synopsis and the combined Part-1 PDF are in the repo root

## Workflow

Branch from `develop` (`feature/*`, `fix/*`, `docs/*`, `chore/*`), open a PR into `develop`, get one approval, merge. `main` only gets `develop` at the end of each sprint.
