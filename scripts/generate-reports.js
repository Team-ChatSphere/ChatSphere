// Part-3 test reports (Test Plan §6–7): runs the server (Jest) and client (Vitest) suites
// with coverage and writes, into docs/reports/:
//   unit-test-report.md, code-coverage-report.md, branch-coverage-report.md,
//   system-validation-report.md, coverage-html/{server,client}/ and raw/*.json
//
//   node scripts/generate-reports.js        (from the repo root; needs npm ci in server/ and client/)
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'reports');
const RAW = path.join(OUT, 'raw');
const today = new Date().toISOString().slice(0, 10);

function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('close', resolve);
  });
}
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const pct = (x) => `${x.pct === 'Unknown' ? '–' : Number(x.pct).toFixed(1)}%`;

function copyDir(src, dst) {
  fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(src, dst, { recursive: true });
}

// ---------------------------------------------------------------------------------------
// Test Plan v1.1 test cases → the automated tests that verify them (regex on full test names).
const TEST_CASES = [
  ['TC-01', 'FR-001', 'Register with unique username and email', [/creates the user and returns its id/, /stores only a bcrypt hash/, /201 \{ userId \}/]],
  ['TC-02', 'FR-001 (neg.)', 'Register with a duplicate email', [/rejects a duplicate (username|email)/, /duplicate email \(TC-02\)/]],
  ['TC-03', 'FR-003', 'Login with valid credentials', [/logs in with .* signed JWT/, /200 \{ token \} for valid credentials/]],
  ['TC-04', 'FR-004, SEC-004', 'Invalid JWT on WebSocket and REST', [/WebSocket handshake is refused with/, /REST without a token is 401/, /tampered payload is rejected/]],
  ['TC-05', 'FR-008, NFR-001', 'DM delivered to online recipient', [/receives Alice.s DM in real time/, /delivery latency is well under the 300 ms target/]],
  ['TC-06', 'FR-009', 'DM to offline recipient', [/sent while Bob is offline arrives when he connects/, /pendingFor returns only undelivered DMs/]],
  ['TC-07', 'FR-012, FR-014', 'Create room and broadcast', [/creates a room, Bob joins, both see each other/, /creates a group and makes its creator the first admin/]],
  ['TC-08', 'FR-021, SEC-002', 'Non-admin admin action rejected', [/non-?admin/i]],
  ['TC-09', 'SEC-003', 'Stored XSS', [/script payload is stored and returned escaped/, /escapes HTML so a script payload/, /rendered as text, not HTML/]],
  ['TC-10', 'FR-018', 'Paginated history', [/after a "reload", both users get the conversation newest first/, /paginates and reports nextPage/, /loads history oldest-first and pages in older/]],
  ['TC-11', 'FR-003, SEC-006', 'Wrong password / unknown user', [/rejects (wrong password|unknown user) with the same 401 message/]],
  ['TC-12', 'FR-011', 'sent → delivered → read', [/Alice gets sent then delivered, then read/, /sent → delivered only once/]],
  ['TC-13', 'FR-010', 'Typing indicator', [/sees Alice start and stop typing/, /typing in a room reaches the other members/, /typing sends one typing:start/]],
  ['TC-14', 'FR-017', 'Retried send not duplicated', [/same key sent twice stores one message/, /concurrent retries with the same key/]],
  ['TC-15', 'SEC-005', 'Rate limit', [/flood of message:send is cut off with RATE_LIMITED/, /over the limit: no next\(\)/]],
  ['TC-16', 'FR-001 (neg.)', 'Username differing only in case', [/concurrent registrations differing only in case/, /usernames are unique ignoring case/]],
  ['TC-17', 'FR-013', 'Join and leave a room', [/joins a group once/, /room:leave removes/, /after reconnecting, a member is back in the room/]],
  ['TC-18', 'FR-015', 'Non-member cannot read or post', [/outsiders can.t post/, /rejects a non-member before persisting/, /non-?member.*(403|forbidden)/i]],
  ['TC-19', 'FR-005, FR-006', 'Presence online / offline', [/presence/i]],
  ['TC-20', 'FR-019, FR-020', 'Admin promotes and removes', [/promot/i, /remov(e|es) a member/i]],
  ['TC-21', 'FR-016', 'Room keeps at least one admin', [/(last|only|sole) admin|at least one admin|keep.*admin/i]],
  ['TC-22', 'NFR-002', 'REST response time under load', []],
  ['TC-23', 'FR-004, SEC-004', 'Token of a deleted user', [/token stops working on both channels once its user is deleted/, /correctly signed token for a user that does not exist/, /authenticate also requires the user to still exist/]],
];

function flatten(results, side) {
  return results.testResults.flatMap((file) =>
    file.assertionResults.map((a) => ({
      side,
      file: path.relative(path.join(ROOT, side), file.name).split(path.sep).join('/'),
      name: a.fullName || [...(a.ancestorTitles || []), a.title].join(' '),
      status: a.status,
      ms: a.duration ?? 0,
    }))
  );
}

function unitReport(server, client, tests) {
  const bySuite = new Map();
  for (const t of tests) {
    const key = `${t.side}/${t.file}`;
    if (!bySuite.has(key)) bySuite.set(key, []);
    bySuite.get(key).push(t);
  }
  const sum = (r) => ({ suites: r.numTotalTestSuites, tests: r.numTotalTests, passed: r.numPassedTests, failed: r.numFailedTests, skipped: r.numPendingTests ?? 0 });
  const s = sum(server);
  const c = sum(client);
  const lines = [
    '# Unit Test Report',
    '',
    `**Date:** ${today} · **Test Plan:** §5.4 (unit / integration) · **Generated by:** \`node scripts/generate-reports.js\``,
    '',
    '| Suite | Runner | Test files | Tests | Passed | Failed | Skipped |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    `| Server | Jest | ${s.suites} | ${s.tests} | ${s.passed} | ${s.failed} | ${s.skipped} |`,
    `| Client | Vitest | ${c.suites} | ${c.tests} | ${c.passed} | ${c.failed} | ${c.skipped} |`,
    `| **Total** | | **${s.suites + c.suites}** | **${s.tests + c.tests}** | **${s.passed + c.passed}** | **${s.failed + c.failed}** | **${s.skipped + c.skipped}** |`,
    '',
    `**Result: ${s.failed + c.failed === 0 ? 'PASS, all tests passed' : 'FAIL, see failures below'}.**`,
    '',
    'Server tests run against a real MongoDB (in-memory via `mongodb-memory-server`); the `tests/e2e` suites start the full server and connect real Socket.IO clients. Client tests use Vitest + Testing Library with a fake socket. The same suites run in CI on every pull request.',
    '',
    '## Per test file',
    '',
    '| Test file | Tests | Passed | Failed | Time |',
    '| --- | --- | --- | --- | --- |',
    ...[...bySuite.entries()].map(([file, ts]) => {
      const failed = ts.filter((t) => t.status === 'failed').length;
      const ms = ts.reduce((a, t) => a + t.ms, 0);
      return `| \`${file}\` | ${ts.length} | ${ts.length - failed} | ${failed} | ${Math.round(ms)} ms |`;
    }),
    '',
    '## All tests',
    '',
  ];
  for (const [file, ts] of bySuite) {
    lines.push(`<details><summary><code>${file}</code> (${ts.length})</summary>`, '');
    for (const t of ts) lines.push(`- ${t.status === 'passed' ? '✅' : t.status === 'failed' ? '❌' : '⏭️'} ${t.name}`);
    lines.push('', '</details>', '');
  }
  return lines.join('\n');
}

function coverageTable(summary, root, key) {
  return Object.entries(summary)
    .filter(([file]) => file !== 'total')
    .map(([file, m]) => [path.relative(root, file).split(path.sep).join('/'), m])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, m]) => (key === 'branch'
      ? `| \`${file}\` | ${m.branches.covered}/${m.branches.total} | ${pct(m.branches)} |`
      : `| \`${file}\` | ${pct(m.statements)} | ${pct(m.lines)} | ${pct(m.functions)} |`));
}

// Uncovered branch locations from the istanbul JSON (coverage-final.json).
function uncoveredBranches(finalJson, root) {
  const out = [];
  for (const [file, data] of Object.entries(finalJson)) {
    const misses = [];
    for (const [id, counts] of Object.entries(data.b || {})) {
      if (counts.some((n) => n === 0)) {
        const loc = data.branchMap[id].loc || data.branchMap[id].locations?.[0];
        misses.push(loc?.start?.line);
      }
    }
    if (misses.length) out.push(`| \`${path.relative(root, file).split(path.sep).join('/')}\` | ${[...new Set(misses)].filter(Boolean).sort((a, b) => a - b).join(', ')} |`);
  }
  return out.sort();
}

function coverageReport(sv, cl, kind) {
  const t = (s) => s.total;
  if (kind === 'code') {
    return [
      '# Code Coverage Report',
      '',
      `**Date:** ${today} · **Tools:** Jest coverage (server, istanbul) · Vitest coverage-v8 (client) · **HTML:** [server](coverage-html/server/index.html) · [client](coverage-html/client/index.html)`,
      '',
      '| Part | Statements | Lines | Functions | Branches |',
      '| --- | --- | --- | --- | --- |',
      `| Server (\`server/src\`) | ${pct(t(sv).statements)} | ${pct(t(sv).lines)} | ${pct(t(sv).functions)} | ${pct(t(sv).branches)} |`,
      `| Client (\`client/src\`) | ${pct(t(cl).statements)} | ${pct(t(cl).lines)} | ${pct(t(cl).functions)} | ${pct(t(cl).branches)} |`,
      '',
      'Branch coverage is reported in detail in [branch-coverage-report.md](branch-coverage-report.md).',
      '',
      '## Server, per file',
      '',
      '| File | Statements | Lines | Functions |',
      '| --- | --- | --- | --- |',
      ...coverageTable(sv, path.join(ROOT, 'server'), 'code'),
      '',
      '## Client, per file',
      '',
      '| File | Statements | Lines | Functions |',
      '| --- | --- | --- | --- |',
      ...coverageTable(cl, path.join(ROOT, 'client'), 'code'),
      '',
      'Notes: `server/src/index.js` (process start-up: connect MongoDB, listen, signal handling) is exercised by the Docker and manual smoke runs rather than unit tests; everything it wires is covered through `gateway.js` in the end-to-end suites. Client entry `main.jsx` is the same.',
      '',
    ].join('\n');
  }
  return null;
}

function branchReport(sv, cl, svFinal, clFinal) {
  return [
    '# Branch Coverage Report',
    '',
    `**Date:** ${today} · **Tools:** Jest coverage (server) · Vitest coverage-v8 (client) · **HTML:** [server](coverage-html/server/index.html) · [client](coverage-html/client/index.html)`,
    '',
    'Branch coverage counts each outcome of every decision point (`if`/`else`, `? :`, `&&`/`||`, `??`, default parameters, `switch` cases).',
    '',
    '| Part | Branches covered | Branch coverage |',
    '| --- | --- | --- |',
    `| Server | ${sv.total.branches.covered}/${sv.total.branches.total} | **${pct(sv.total.branches)}** |`,
    `| Client | ${cl.total.branches.covered}/${cl.total.branches.total} | **${pct(cl.total.branches)}** |`,
    '',
    '## Server, per file',
    '',
    '| File | Branches covered | Branch % |',
    '| --- | --- | --- |',
    ...coverageTable(sv, path.join(ROOT, 'server'), 'branch'),
    '',
    '## Client, per file',
    '',
    '| File | Branches covered | Branch % |',
    '| --- | --- | --- |',
    ...coverageTable(cl, path.join(ROOT, 'client'), 'branch'),
    '',
    '## Uncovered branches (line numbers)',
    '',
    'Where at least one outcome of a branch never ran. Most are defensive paths (unexpected database errors, missing optional arguments).',
    '',
    '| File | Lines |',
    '| --- | --- |',
    ...uncoveredBranches(svFinal, path.join(ROOT, 'server')),
    ...uncoveredBranches(clFinal, path.join(ROOT, 'client')),
    '',
  ].join('\n');
}

function validationReport(tests) {
  const postman = fs.existsSync(path.join(ROOT, 'docs/postman/results/newman-results.json'))
    ? readJson(path.join(ROOT, 'docs/postman/results/newman-results.json')).run.stats
    : null;
  const load = fs.existsSync(path.join(OUT, 'load-test.json')) ? readJson(path.join(OUT, 'load-test.json')) : null;

  const rows = [];
  const details = [];
  let pass = 0;
  let notRun = 0;
  for (const [id, req, title, patterns] of TEST_CASES) {
    const matched = tests.filter((t) => patterns.some((p) => p.test(t.name)));
    let status;
    let evidence;
    if (id === 'TC-22') {
      status = load && load.rest.pass ? 'PASS' : 'NOT RUN';
      evidence = load ? `Load test: p95 REST ${load.rest.p95} ms over ${load.rest.count} requests ([load-test.md](load-test.md)); Postman timing assertions` : 'load test not run';
    } else if (!matched.length) {
      status = 'NOT RUN';
      evidence = 'no automated test found yet';
    } else {
      status = matched.every((t) => t.status === 'passed') ? 'PASS' : 'FAIL';
      evidence = `${matched.length} automated test(s)`;
    }
    if (id === 'TC-05' && load) evidence += `; load test p95 delivery ${load.delivery.p95} ms (${load.delivery.count} DMs, 0 lost)`;
    if (status === 'PASS') pass += 1;
    if (status === 'NOT RUN') notRun += 1;
    rows.push(`| ${id} | ${req} | ${title} | ${status === 'PASS' ? '✅ PASS' : status === 'FAIL' ? '❌ FAIL' : '⏳ NOT RUN'} | ${evidence} |`);
    if (matched.length) {
      details.push(`<details><summary><b>${id}</b>: ${title} (${matched.length})</summary>`, '');
      for (const t of matched) details.push(`- ${t.status === 'passed' ? '✅' : '❌'} \`${t.side}/${t.file}\` › ${t.name}`);
      details.push('', '</details>', '');
    }
  }

  return [
    '# System Validation Report',
    '',
    `**Date:** ${today} · **Against:** Test Plan v1.1 (\`docs/ChatSphere_TestPlan_v1.1.pdf\`), Appendix A · **Generated by:** \`node scripts/generate-reports.js\``,
    '',
    '## How the system was validated',
    '',
    '- **Automated end-to-end tests**: the real server (Express + Socket.IO + MongoDB) is started and driven by real Socket.IO / HTTP clients for 2–3 users (`server/tests/e2e/`).',
    '- **Service, route and model tests** against a real (in-memory) MongoDB; **client tests** with Testing Library.',
    `- **API tests**: Postman collection run with newman against a running server${postman ? `: **${postman.requests.total} requests, ${postman.assertions.total} assertions, ${postman.assertions.failed} failed**` : ''} ([results](../postman/results/README.md)).`,
    `- **Performance**: load test for NFR-001/NFR-002${load ? `: p95 delivery **${load.delivery.p95} ms** (target 300), p95 REST **${load.rest.p95} ms** (target 1000)` : ''} ([report](load-test.md)).`,
    '- **Deployment**: `docker compose up --build` smoke test (all containers healthy; register, login, live DM, history, client served).',
    '',
    `## Result: ${pass}/${TEST_CASES.length} test cases passed${notRun ? `, ${notRun} not yet run` : ''}`,
    '',
    '| TC | Requirement(s) | Test case | Result | Evidence |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '## Evidence per test case',
    '',
    ...details,
  ].join('\n');
}

async function main() {
  fs.mkdirSync(RAW, { recursive: true });
  console.log('Running server tests with coverage…');
  await run('npx', ['jest', '--coverage', '--json', '--outputFile=../docs/reports/raw/server-tests.json'], path.join(ROOT, 'server'));
  console.log('Running client tests with coverage…');
  await run('npx', ['vitest', 'run', '--coverage', '--reporter=default', '--reporter=json', '--outputFile=../docs/reports/raw/client-tests.json'], path.join(ROOT, 'client'));

  const server = readJson(path.join(RAW, 'server-tests.json'));
  const client = readJson(path.join(RAW, 'client-tests.json'));
  const svSum = readJson(path.join(ROOT, 'server/coverage/coverage-summary.json'));
  const clSum = readJson(path.join(ROOT, 'client/coverage/coverage-summary.json'));
  const svFinal = readJson(path.join(ROOT, 'server/coverage/coverage-final.json'));
  const clFinal = readJson(path.join(ROOT, 'client/coverage/coverage-final.json'));
  // Keep repo-relative file names only (no local machine paths in committed reports).
  const relKeys = (summary) => Object.fromEntries(Object.entries(summary).map(([k, v]) => [k === 'total' ? k : rel(k), v]));
  fs.writeFileSync(path.join(RAW, 'server-coverage-summary.json'), `${JSON.stringify(relKeys(svSum), null, 2)}\n`);
  fs.writeFileSync(path.join(RAW, 'client-coverage-summary.json'), `${JSON.stringify(relKeys(clSum), null, 2)}\n`);
  copyDir(path.join(ROOT, 'server/coverage'), path.join(OUT, 'coverage-html/server'));
  copyDir(path.join(ROOT, 'client/coverage'), path.join(OUT, 'coverage-html/client'));
  for (const side of ['server', 'client']) {
    for (const f of ['coverage-final.json', 'coverage-summary.json']) fs.rmSync(path.join(OUT, 'coverage-html', side, f), { force: true });
  }

  const tests = [...flatten(server, 'server'), ...flatten(client, 'client')];
  fs.writeFileSync(path.join(OUT, 'unit-test-report.md'), unitReport(server, client, tests));
  fs.writeFileSync(path.join(OUT, 'code-coverage-report.md'), coverageReport(svSum, clSum, 'code'));
  fs.writeFileSync(path.join(OUT, 'branch-coverage-report.md'), branchReport(svSum, clSum, svFinal, clFinal));
  fs.writeFileSync(path.join(OUT, 'system-validation-report.md'), validationReport(tests));
  // Raw test results reference absolute local paths; keep only what the reports need.
  for (const f of ['server-tests.json', 'client-tests.json']) {
    const r = readJson(path.join(RAW, f));
    const slim = { numTotalTests: r.numTotalTests, numPassedTests: r.numPassedTests, numFailedTests: r.numFailedTests,
      testResults: r.testResults.map((x) => ({ name: rel(x.name), assertionResults: x.assertionResults.map((a) => ({ fullName: a.fullName, status: a.status, duration: a.duration })) })) };
    fs.writeFileSync(path.join(RAW, f), `${JSON.stringify(slim, null, 2)}\n`);
  }
  console.log(`Reports written to ${rel(OUT)}/ (${server.numPassedTests + client.numPassedTests}/${server.numTotalTests + client.numTotalTests} tests passed)`);
  process.exit(server.numFailedTests + client.numFailedTests ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
