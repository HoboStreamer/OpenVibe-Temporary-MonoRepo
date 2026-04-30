# OpenVibe testing workflows

The monorepo test runner is `node scripts/run-tests.js` (aliased as `npm test`).
It now supports component-aware selection, changed-file targeting, parallel
workers, a timing cache, and live runner metadata files under
`.cache/openvibe/test-runner/`.

## The short version

Use the smallest test slice that matches your change:

- Whole repo, deterministic order: `npm test`
- Whole repo, faster parallel mode: `npm run test:fast`
- Only changed components: `npm run test:changed`
- Only service tests: `npm run test:services`
- Only package tests: `npm run test:packages`
- Only script tests: `npm run test:scripts`
- See what exists: `npm run test:list:components`

For one component:

- `npm test -- --component=openvibe-content`
- `npm test -- --scope=services/openvibe-network`
- `npm test -- --scope=packages/openvibe-sdk`

For one exact file:

- `npm test -- --file=services/openvibe-content/test/content-api.test.js`

## Why `| tail -40` looks stuck

This is shell behavior, not the test runner being lazy.

When you run:

- `npm run test:fast 2>&1 | tail -40`

`tail -40` waits for **end-of-file** before it prints the final 40 lines. So
live progress is hidden until the command exits.

If you want live progress, use one of these instead:

- run the command directly: `npm run test:fast`
- follow the runner log file: `tail -f .cache/openvibe/test-runner/latest.log`
- inspect the status snapshot: `watch -n 1 cat .cache/openvibe/test-runner/status.json`
- keep a live copy and a file at the same time: `npm run test:fast | tee /tmp/openvibe-test.log`

## What the runner writes

Every run can write these files (both are enabled by default):

- `.cache/openvibe/test-runner/latest.log`
  - full console output for the current run
- `.cache/openvibe/test-runner/status.json`
  - machine-readable snapshot with totals, pass/fail counts, active tests,
    queue remaining, elapsed time, and ETA
- `.cache/openvibe/test-runner/timings.json`
  - historical per-file durations used to schedule slow tests first in
    parallel runs

Disable them if needed:

- `npm test -- --no-log-file`
- `npm test -- --no-status-file`
- `npm test -- --no-timing-cache`

## Selector flags

### `--component`

Run every test for one component name.

Examples:

- `npm test -- --component=openvibe-content`
- `npm test -- --component=openvibe-sdk`
- `npm test -- --component=staging`

This matches the component name inferred from the path:

- `services/<name>/...` → service component
- `packages/<name>/...` → package component
- `scripts/<name>/...` → script component

You can also qualify the type explicitly:

- `npm test -- --component=service:openvibe-content`
- `npm test -- --component=script:staging`

### `--scope`

Run every test under a repo subtree.

Examples:

- `npm test -- --scope=services/openvibe-content`
- `npm test -- --scope=packages/openvibe-persistence`
- `npm test -- --scope=scripts/staging`

### `--type`

Run one component type.

Examples:

- `npm test -- --type=service`
- `npm test -- --type=package`
- `npm test -- --type=script`

### `--file`

Run one or more exact test files.

Examples:

- `npm test -- --file=services/openvibe-content/test/content-api.test.js`
- `npm test -- --file=services/openvibe-content/test/content-api.test.js,scripts/staging/test/browser-smoke.test.js`

### `--match`

Regex or substring match against test file paths.

Examples:

- `npm test -- --match=browser-smoke`
- `npm test -- --match='openvibe-(content|network)'`

### `--changed`

Map changed files to their owning components, then run tests for those
components only.

Examples:

- `npm run test:changed`
- `npm test -- --changed=origin/main`

This is usually the best default when you have touched a service/package/script
and do **not** need repo-wide confidence yet.

### `--related`

Run tests for the component that owns one or more source files.

Examples:

- `npm test -- --related=services/openvibe-content/server/routes.js`
- `npm test -- --related=services/openvibe-network/public/admin.html,scripts/staging/browser-smoke.js`

## Parallelism and speed

### Serial vs parallel

- `npm test`
  - serial, stable, easiest to read
- `npm run test:fast`
  - parallel with `--jobs=auto`
  - currently caps at 8 workers to avoid going full leaf-blower mode on the box

You can set worker counts manually:

- `npm test -- --jobs=4`
- `npm test -- --jobs=half`
- `npm test -- --jobs=75%`
- `npm test -- --jobs=max`

### Timing cache

Parallel runs sort historically slow files first using
`.cache/openvibe/test-runner/timings.json`. This improves wall-clock time and
makes ETA less silly on repeated runs.

### Fail fast

Use `--bail` to stop scheduling new files after the first failure:

- `npm test -- --component=openvibe-content --bail`

## Recommended workflows

### Editing one service

Examples:

- content work → `npm test -- --component=openvibe-content`
- network/admin work → `npm test -- --component=openvibe-network`
- billing work → `npm test -- --component=openvibe-billing`

Then, when the slice is green, run broader coverage if the change crosses
service boundaries.

### Editing a shared package

Run the owning package tests first:

- `npm test -- --component=openvibe-sdk`
- `npm test -- --component=openvibe-persistence`
- `npm test -- --component=openvibe-contracts`

If the package affects many services, follow with `npm run test:changed` or the
specific consumer components.

### Editing browser smoke/admin runtime

Use targeted script tests before the full suite:

- `npm test -- --scope=scripts/staging`
- `npm test -- --file=scripts/staging/test/browser-smoke.test.js`
- `npm test -- --file=scripts/staging/test/browser-smoke-playwright.test.js`

### Before a broader merge / phase landing

Run at least:

- `npm run check`
- `npm run test:fast`

For runtime/UI changes that affect the local stack, follow with the relevant
smoke/readiness commands too.

## Discovery helpers

List exact files:

- `npm run test:list`
- `npm test -- --component=openvibe-content --list`

List component buckets:

- `npm run test:list:components`
- `npm test -- --type=service --list-components`

## NPM scripts

Current shortcuts in the repo root:

- `npm test`
- `npm run test:fast`
- `npm run test:changed`
- `npm run test:services`
- `npm run test:packages`
- `npm run test:scripts`
- `npm run test:component -- --component=<name>`
- `npm run test:list`
- `npm run test:list:components`

## Practical rule of thumb

If you changed one thing, do **not** immediately run the entire monorepo unless
that thing is shared infrastructure. Start narrow, then widen confidence only as
needed. Your CPU will thank you, and your future self will stop rage-staring at
mysterious six-minute commands.
