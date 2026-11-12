// Load test for NFR-001 (95% of messages delivered ≤ 300 ms) and NFR-002 (95% of REST
// responses ≤ 1 s). Starts the real server (in-memory MongoDB), connects USERS sockets
// in pairs, each sender sends MESSAGES DMs at a steady pace while REST history requests
// run concurrently, then writes docs/reports/load-test.{json,md}.
//
//   npm run loadtest                       # defaults below
//   USERS=200 MESSAGES=30 npm run loadtest
const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../tests/helpers/db');
const { startStack } = require('../tests/helpers/stack');

const USERS = Number(process.env.USERS) || 100; // even: half send, half receive
const MESSAGES = Number(process.env.MESSAGES) || 20; // per sender
const SEND_INTERVAL_MS = Number(process.env.SEND_INTERVAL_MS) || 600; // within the 2 msg/s rate limit
const REST_REQUESTS = Number(process.env.REST_REQUESTS) || 500;
const REST_CONCURRENCY = Number(process.env.REST_CONCURRENCY) || 25;
const OUT_DIR = path.join(__dirname, '..', '..', 'docs', 'reports');

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const r = (x) => Math.round(x * 10) / 10;
  return { count: s.length, min: r(s[0]), mean: r(mean), p50: r(pct(s, 50)), p95: r(pct(s, 95)), p99: r(pct(s, 99)), max: r(s[s.length - 1]) };
}

async function main() {
  await db.connect();
  // Production-like bcrypt cost does not matter here; registration is setup, not measured.
  const stack = await startStack();
  console.log(`Setting up ${USERS} users…`);

  const users = [];
  for (let i = 0; i < USERS; i += 1) users.push(await stack.user(`load${i}`));
  const sockets = await Promise.all(users.map((u) => stack.socketFor(u.token)));

  // --- NFR-001: DM delivery latency (send on A → message:new on B) -------------------
  const latencies = [];
  const pending = new Map(); // key → send time
  let lost = 0;
  const pairs = [];
  for (let i = 0; i < USERS; i += 2) pairs.push([i, i + 1]);
  for (const [, r] of pairs) {
    sockets[r].on('message:new', (m) => {
      const sent = pending.get(m.idempotencyKey);
      if (sent !== undefined) {
        latencies.push(performance.now() - sent);
        pending.delete(m.idempotencyKey);
      }
    });
  }

  console.log(`Sending ${pairs.length * MESSAGES} DMs (${pairs.length} senders × ${MESSAGES}, every ${SEND_INTERVAL_MS} ms)…`);
  const t0 = performance.now();
  await Promise.all(
    pairs.map(async ([s, r], pi) => {
      await new Promise((res) => setTimeout(res, (pi * SEND_INTERVAL_MS) / pairs.length)); // stagger
      for (let k = 0; k < MESSAGES; k += 1) {
        const key = `p${pi}-m${k}`;
        pending.set(key, performance.now());
        sockets[s].emit('message:send', { toUserId: users[r].id, content: `load message ${k}`, idempotencyKey: key });
        await new Promise((res) => setTimeout(res, SEND_INTERVAL_MS));
      }
    })
  );
  await new Promise((res) => setTimeout(res, 2000)); // let the last deliveries land
  lost = pending.size;
  const sendSeconds = (performance.now() - t0) / 1000;

  // --- NFR-002: REST response time (DM history, authenticated) -------------------------
  const historyTargets = await Promise.all(
    pairs.slice(0, 10).map(async ([s, r]) => {
      const sock = sockets[s];
      const ack = await new Promise((res) => sock.emit('message:send', { toUserId: users[r].id, content: 'seed' }, res));
      return { token: users[s].token, roomId: ack.message.roomId };
    })
  );
  const restTimes = [];
  let restErrors = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: REST_CONCURRENCY }, async () => {
      while (next < REST_REQUESTS) {
        const t = historyTargets[next % historyTargets.length];
        next += 1;
        const start = performance.now();
        const res = await stack.api('GET', `/api/messages/${t.roomId}?page=1&pageSize=20`, { token: t.token });
        restTimes.push(performance.now() - start);
        if (res.status !== 200) restErrors += 1;
      }
    })
  );

  const delivery = stats(latencies);
  const rest = stats(restTimes);
  const result = {
    date: new Date().toISOString(),
    machine: `${os.cpus()[0].model.trim()}, ${os.cpus().length} cores, ${Math.round(os.totalmem() / 2 ** 30)} GB RAM, Node ${process.version}`,
    setup: { users: USERS, senders: pairs.length, messagesPerSender: MESSAGES, sendIntervalMs: SEND_INTERVAL_MS, restRequests: REST_REQUESTS, restConcurrency: REST_CONCURRENCY },
    delivery: { ...delivery, lost, throughputPerSec: Math.round((latencies.length / sendSeconds) * 10) / 10, targetP95Ms: 300, pass: lost === 0 && delivery.p95 <= 300 },
    rest: { ...rest, errors: restErrors, targetP95Ms: 1000, pass: restErrors === 0 && rest.p95 <= 1000 },
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'load-test.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));

  await stack.stop();
  await db.disconnect();
  process.exit(result.delivery.pass && result.rest.pass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
