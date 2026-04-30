---
description: "OpenVibe test runner usage. Use when: running, writing, or selecting tests; touching files under services/**/test, packages/**/test, scripts/**/test, or scripts/run-tests.js."
applyTo: "{services,packages,scripts}/**/test/**,scripts/run-tests.js,**/*.test.js"
---

# OpenVibe testing

The repo runner is [scripts/run-tests.js](../../scripts/run-tests.js) (aliased
as `npm test`). Full reference: [docs/openvibe/testing-workflows.md](../../docs/openvibe/testing-workflows.md).

## Always

- Use the npm scripts. **Do not** call `node`, `jest`, `mocha`, or `vitest`
  directly against a test file — the runner owns ordering, jobs, timing cache,
  and component selection.
- Pick the **smallest** slice that covers the change:
  - One file: `npm test -- --file=<path>`
  - One component: `npm test -- --component=<name>` (e.g. `openvibe-content`)
  - Touched components only: `npm run test:changed`
  - Repo-wide confidence: `npm run test:fast` (parallel) or `npm test` (serial)
- Cross-service / shared-package changes warrant `npm run test:fast` before
  declaring done.

## Never

- Never pipe a run to `| tail` / `| head`. They buffer until EOF and hide live
  progress. To inspect output, follow `.cache/openvibe/test-runner/latest.log`
  or `tee` to a file.
- Never silence a failing test to make a slice green. If the test is wrong,
  fix the test with a clear commit reason; if the code is wrong, fix the code.
- Never disable the timing cache, status file, or log file in normal runs
  (`--no-timing-cache`, `--no-status-file`, `--no-log-file`) — they exist so
  the next agent can see what happened.

## Writing tests

- Place tests next to their owner: `services/<svc>/test/`, `packages/<pkg>/test/`,
  `scripts/<area>/test/`. The runner infers component from this path.
- Keep tests deterministic and runnable without network, Docker, or real
  Postgres/Redis. Tests requiring the live local stack belong in
  `scripts/staging/test/` and must clearly document their preconditions.
- Schema changes require a matching test (or readiness check) — see the
  persistence parity instructions.
