# Test Reports (Part-3)

| Report | What it shows |
| --- | --- |
| [Unit Test Report](unit-test-report.md) | Every server (Jest) and client (Vitest) test, per file, pass/fail |
| [Code Coverage Report](code-coverage-report.md) | Statement / line / function coverage, server and client, per file |
| [Branch Coverage Report](branch-coverage-report.md) | Branch coverage per file and the uncovered branch locations |
| [System Validation Report](system-validation-report.md) | Every Test Plan v1.1 test case (TC-01 to TC-23) with its result and evidence |
| [Load Test Report](load-test.md) | NFR-001 / NFR-002 measurements |
| [Postman run](../postman/results/README.md) | API test run with newman |
| HTML coverage | [server](coverage-html/server/index.html) · [client](coverage-html/client/index.html) (open locally in a browser) |

Regenerate everything from the repo root (needs `npm ci` in `server/` and `client/`):

```bash
node scripts/generate-reports.js      # unit, coverage, branch coverage, system validation
cd server && npm run loadtest          # load test
cd server && npm run postman           # Postman / newman run
```
