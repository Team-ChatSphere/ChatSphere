// Runs the Postman collection with newman against a real server (Test Plan §8, CS-14/CS-35).
// Without BASE_URL it starts its own server on an in-memory MongoDB; with BASE_URL it uses
// that server (e.g. the docker compose stack). Results go to docs/postman/results/.
//
//   npm run postman
//   BASE_URL=http://localhost:4000 npm run postman
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { seedDm } = require('./seedDm');

const ROOT = path.join(__dirname, '..', '..');
// Paths relative to the repo root (newman runs from there), so a space in the checkout
// path can't break the shell command on Windows.
const COLLECTION = 'docs/postman/ChatSphere.postman_collection.json';
const OUT_REL = 'docs/postman/results';
const OUT = path.join(ROOT, 'docs', 'postman', 'results');

function runNewman(args) {
  // Async on purpose: the server may be running in this same process, so a blocking
  // spawnSync would freeze it and newman's first request would never be answered.
  return new Promise((resolve) => {
    const child = spawn('npx', args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('close', resolve);
  });
}

async function main() {
  let base = process.env.BASE_URL;
  let stop = async () => {};
  if (!base) {
    const db = require('../tests/helpers/db');
    const { startStack } = require('../tests/helpers/stack');
    await db.connect();
    const stack = await startStack();
    base = stack.base;
    stop = async () => {
      await stack.stop();
      await db.disconnect();
    };
  }

  const seed = await seedDm(base);
  fs.mkdirSync(OUT, { recursive: true });
  const status = await runNewman([
    '-y', 'newman@6', 'run', COLLECTION,
    '--env-var', `baseUrl=${base}`,
    '--env-var', `conversationId=${seed.conversationId}`,
    '--env-var', `dmUser=${seed.dmUser}`,
    '--env-var', `dmPassword=${seed.dmPassword}`,
    '-r', 'cli,json,junit',
    '--reporter-json-export', `${OUT_REL}/newman-results.json`,
    '--reporter-junit-export', `${OUT_REL}/newman-results.xml`,
  ]);
  await stop();

  // A short human-readable summary next to the raw results.
  const { run: r } = JSON.parse(fs.readFileSync(path.join(OUT, 'newman-results.json'), 'utf8'));
  const rows = r.executions.map((e) => {
    const asserts = e.assertions || [];
    const failed = asserts.filter((a) => a.error).length;
    return `| ${e.item.name} | ${e.request.method} | ${e.response?.code ?? '-'} | ${e.response?.responseTime ?? '-'} ms | ${asserts.length - failed}/${asserts.length} | ${failed ? 'FAIL' : 'PASS'} |`;
  });
  const s = r.stats;
  const md = [
    '# Postman / newman run',
    '',
    `Run: ${new Date(r.timings.started).toISOString()} · server: ${process.env.BASE_URL || 'local server, in-memory MongoDB (`npm run postman`)'}`,
    '',
    `**Requests:** ${s.requests.total} (${s.requests.failed} failed) · **Assertions:** ${s.assertions.total} (${s.assertions.failed} failed) · **Average response:** ${Math.round(r.timings.responseAverage)} ms`,
    '',
    '| Request | Method | Status | Time | Assertions passed | Result |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    'Raw output: `newman-results.json` (full) and `newman-results.xml` (JUnit).',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'README.md'), md);
  process.exit(status ?? 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
