# Postman collection (Test Plan 8)

`ChatSphere.postman_collection.json` covers the REST API in SAD 3.2.1: register, login and DM history, including the negative cases (duplicate email, short password, wrong password, missing token, non-participant, bad paging).

## Run it

1. Postman → **Import** → pick `ChatSphere.postman_collection.json`.
2. Collection → **Variables**: set `baseUrl` if the server isn't on `http://localhost:4000`.
3. Run the **Auth** folder first. Register picks a fresh username/email and Login stores `token` automatically.
4. Set `conversationId` to a DM room id the logged-in user is in (e.g. from a `message:new` event), then run **DM history**.

From the command line:

```bash
npx newman run docs/postman/ChatSphere.postman_collection.json --env-var baseUrl=http://localhost:4000
```

Export run results to `docs/postman/results/` for the validation report.
