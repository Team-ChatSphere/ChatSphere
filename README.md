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

## Run with Docker

```bash
docker compose up --build     # client http://localhost:8080, server http://localhost:4000
docker compose down -v         # stop and delete the data volume
```

Runs the server, the React client (nginx), MongoDB 6 and Redis 7. Set `JWT_SECRET` in your shell or a root `.env` for anything beyond a local demo.

## Tests

```bash
cd server && npm run lint && npm test   # Jest
cd client && npm test && npm run build  # Vitest
```

CI runs the same on every PR and push to `develop` / `main`.

## Docs

- [API reference](docs/API.md): REST endpoints, Socket.IO events, payloads and error codes
- [Postman collection and run results](docs/postman/README.md): collection, reproducible Newman run and recorded results
- [Test and coverage reports](docs/reports/README.md): generated test report, coverage summaries and Test Plan v1.1 system validation
- `docs/`: SRS v1.1, SAD v1.0, Test Plan v1.0 and v1.1 (PDF), integration contract, RTM and deviation log
- Synopsis and the combined Part-1 PDF are in the repo root

## Workflow

Branch from `develop` (`feature/*`, `fix/*`, `docs/*`, `chore/*`), open a PR into `develop`, get one approval, merge. `main` only gets `develop` at the end of each sprint.
