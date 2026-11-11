# Postman collection (Test Plan §8)

`ChatSphere.postman_collection.json` covers every REST endpoint in SAD 3.2.1 (health, register, login, DM history) with positive and negative cases: duplicate email, short password, wrong password, unknown user, missing / tampered token, non-participant, bad paging, malformed id. Socket.IO events are documented in [`docs/API.md`](../API.md).

## Run it automatically (recommended)

```bash
cd server
npm run postman                                   # starts its own server (in-memory MongoDB)
BASE_URL=http://localhost:4000 npm run postman    # or against a running server / docker compose
```

The runner seeds two users with a DM conversation, runs the whole collection with newman and writes the results to [`results/`](results/README.md) (summary table, full JSON, JUnit XML).

## Run it in the Postman app

1. Start the server, then `cd server && BASE_URL=http://localhost:4000 npm run seed:dm`. It prints `conversationId`, `dmUser` and `dmPassword`.
2. Postman → **Import** → `ChatSphere.postman_collection.json`.
3. Collection → **Variables**: paste those three values (and `baseUrl` if not `http://localhost:4000`).
4. **Run collection**. Register creates a fresh user on every run, so repeated runs don't collide.
