Meta-prompt for ChatGPT — Convert an OpenVibe phase request into a repo-grounded GitHub Copilot Chat implementation prompt

Purpose

This is an upstream reusable meta-prompt you (ChatGPT) will use to turn a developer-provided OpenVibe phase / migration request into:

A) a concise repo-grounded OpenVibe architecture + implementation plan, and
B) one single Markdown code block containing the downstream prompt the developer will paste into GitHub Copilot Chat in Visual Studio Code so Copilot can implement the work.

The workspace already contains both repos locally.
Do not restate repo URLs in the Copilot prompt.
Use workspace-grounded references only:
- `#codebase`
- `#file:<relative-path-from-workspace-root>`

The workspace root contains folders like:
- `HoboStreamer.com/...`
- `HoboApp/...`

How to use this meta-prompt

- Read the developer request enclosed in:
  `<OPENVIBE_PHASE_REQUEST>...</OPENVIBE_PHASE_REQUEST>`
- If provided, also read:
  - `<OPENVIBE_PLAN_CONTEXT>...</OPENVIBE_PLAN_CONTEXT>`
  - `<PHASE_SCOPE>...</PHASE_SCOPE>`
  - `<TARGET_OUTCOMES>...</TARGET_OUTCOMES>`
  - `<DELIVERY_CONSTRAINTS>...</DELIVERY_CONSTRAINTS>`
- Treat the contents of `<OPENVIBE_PHASE_REQUEST>` as the authoritative task definition.
- Treat the OpenVibe plan context as architecture authority unless the request explicitly overrides it.
- Use repo inspection tools for grounding. Do not guess.
- Produce exactly two outputs in this order:
  1. OUTPUT A — concise repo-grounded OpenVibe phase analysis + file-by-file implementation plan
  2. OUTPUT B — one single Markdown code block containing the GitHub Copilot Chat prompt

Strict instructions for ChatGPT

1) Treat `<OPENVIBE_PHASE_REQUEST>...</OPENVIBE_PHASE_REQUEST>` as the source-of-truth request
- Do not drift into unrelated tangents.
- Do not quietly rewrite the requested phase into a different phase.
- If the requested phase depends on earlier missing kernel work, say so explicitly and include only the minimum prerequisite work needed.
- If the request references OpenVibe phases using older numbering, reconcile the numbering explicitly in OUTPUT A and then proceed with the most specific/latest phase definition.

2) Ground everything in the actual workspace code
- Inspect the codebase first using repo/code inspection tools.
- Start with the authoritative entrypoints and READMEs in both repos.
- Identify exactly what today lives in:
  - `HoboStreamer.com`
  - `HoboApp/hobo-tools`
  - `HoboApp/packages/*`
  - any sibling Hobo services if directly relevant
- Distinguish cleanly:
  - current runtime ownership
  - current identity/control-plane ownership
  - what must move
  - what should remain where for now
- If a requested OpenVibe service/repo does not yet exist in the workspace, do not pretend it exists. Instead:
  - map it to the correct current repo
  - recommend the migration-safe location to create it
  - prefer additive new directories/packages/services inside the existing workspace when that is the least disruptive path

3) Preserve the OpenVibe architecture rules unless the request explicitly changes them
Assume these rules are binding unless the developer says otherwise:
- identity is centralized
- shared state is mutated through platform APIs, not ad hoc cross-service writes
- cross-service communication uses events and/or capabilities
- media is centralized
- money is ledger-backed and centrally enforced
- everything shared is namespaced, permissioned, and versioned
- migration should be additive and backward-compatible where practical
- current Hobo installs must not be casually broken during the OpenVibe transition

4) When generating the downstream Copilot prompt
- Always begin it with:
  `Analyze the #codebase then`
- Use explicit `#file:<relative-path>` references from the workspace root for the files Copilot should inspect first.
- Do not remind Copilot where the repos are located beyond the `#file:` references.
- Do not use repo URLs in the Copilot prompt unless external docs truly must be fetched.
- If new OpenVibe services/packages need to be created, instruct Copilot to create them inside the current workspace in the cleanest migration-safe location, usually:
  - within `HoboApp/` for new control-plane or package work
  - within `HoboStreamer.com/` only when the phase truly belongs to the streaming runtime
- Require Copilot to preserve compatibility shims/wrappers/aliases when replacing Hobo-branded paths or config.

5) Produce exactly two outputs in this order

OUTPUT A — Repo-grounded OpenVibe phase analysis & file-by-file plan

Keep it concise, technical, and useful.
Use short sections with direct statements.

Required sections for OUTPUT A:

- Phase scope and target outcome
  - which OpenVibe phase/slice is being implemented
  - what “done” means for this request
  - what is explicitly out of scope

- Current architecture summary
  - where the source-of-truth currently lives
  - which modules currently own the relevant flows
  - which repo is primary for this phase
  - which repo is secondary / compatibility-only / consumer-only if applicable

- Target architecture delta
  - what the codebase needs to become after this phase
  - which future OpenVibe services/packages/directories need to exist after this slice
  - whether the implementation should be:
    - in-place evolution
    - additive migration scaffolding
    - extraction with compatibility wrappers
    - or a mix

- Repo ownership map
  - what belongs in `HoboStreamer.com`
  - what belongs in `HoboApp`
  - what should become a shared package
  - what should not be moved yet

- Dependency / blocker scan
  - short ranked list of prerequisites or directly coupled issues
  - one sentence each
  - mention why each one must be included now if it affects phase completion

- File-by-file implementation plan
  - one line per file in this form:
    `- #file:... — short description of the edits`
  - include new-file creation notes where needed
  - include server, client, DB/migration, tests, docs, admin, config/env surfaces only if relevant

- Acceptance criteria
  - short numbered list of verifiable outcomes
  - include practical manual validation where relevant:
    - auth flows
    - host/subdomain routing
    - API flows
    - WebSocket/event flows
    - permissions enforcement
    - migration compatibility
    - reconnect / multi-account / multi-tab if relevant

- Quick risk / migration notes
  - DB changes
  - backfills
  - env/config migration
  - compatibility shims
  - rollback notes
  - rollout caveats
  - external service/provider caveats if relevant

- Explicit deferrals
  - list the important adjacent work that belongs to later phases
  - this is required to keep scope disciplined

OUTPUT B — Single Copilot prompt in one Markdown code block only

This code block is the exact prompt the developer will paste into GitHub Copilot Chat in VS Code.

The Copilot prompt must:

- start with:
  `Analyze the #codebase then`
- include explicit `#file:` references for every authoritative existing file Copilot must inspect first
- tell Copilot to:
  1. perform confirmatory analysis first
  2. identify exact functions/paths/tables/routes to change
  3. implement the code, not stop at planning
  4. make minimal, surgical edits where possible
  5. create additive OpenVibe migration scaffolding when needed
  6. preserve backward compatibility unless the request explicitly allows breaking changes
  7. add regression coverage / tests where practical
  8. run basic static/syntax checks
  9. update docs / env examples / migration notes
  10. output a final verification checklist and file-change summary

- require server-side authority where applicable
  - server must enforce permissions/validation before fanout or persistence
  - client behavior must align with server hardening
  - no trust in client-side-only checks for identities, billing, permissions, registries, or shared data writes

- require end-to-end completion
  - not backend-only
  - not frontend-only
  - not “here is a plan”
  - actual implementation plus validation guidance

- tell Copilot not to do shallow patches
- tell Copilot not to rename public APIs without migration notes
- tell Copilot not to remove data
- tell Copilot to use existing project patterns/modules instead of inventing new frameworks
- tell Copilot to keep the OpenVibe architecture consistent with the requested phase
- tell Copilot to add diagnostics/logging for changed paths when useful
- tell Copilot to provide unified diffs or apply_patch-style change summaries when helpful
- tell Copilot to finish with:
  - files changed
  - what changed
  - tests/checks run
  - how to validate locally
  - remaining edge cases if any

6) Output formatting rules for ChatGPT
- Begin with a very short progress summary:
  - what you inspected
  - why those files matter
- Then OUTPUT A
- Then OUTPUT B as exactly one Markdown code block
- Do not add extra commentary after OUTPUT B
- Do not implement the code yourself in that response
- Do not output multiple code blocks for OUTPUT B

7) Scope discipline rules
- Stay tightly scoped to the requested OpenVibe phase/slice
- Do not randomly drag in unrelated product surfaces unless the code proves they are directly coupled
- If you find directly related coupled work, mention it explicitly and justify why it must be included now
- Prefer additive migration slices over sprawling rewrites
- If the request is very broad, break it into the smallest coherent implementation slice that still produces a meaningful OpenVibe milestone

8) OpenVibe-specific engineering constraints
These must be embedded inside OUTPUT B when relevant:

- Do not rename public APIs without migration notes
- Do not delete data
- If schema changes are required:
  - include a safe migration
  - include a backfill plan if needed
  - preserve existing installs
- Reuse existing Express middleware, DB helpers, route patterns, websocket services, and shared package patterns where practical
- If creating new OpenVibe directories/services in the current workspace, do so additively and document the intended future repo split
- Preserve Hobo compatibility aliases/wrappers/config fallbacks unless the developer explicitly requests a hard cut
- Add diagnostics/logging/metrics hooks for changed paths when useful
- Preserve backward compatibility unless the developer explicitly asked for a breaking change
- If browser/platform/provider limitations exist, state them clearly rather than pretending the app can override them
- If a requested phase touches:
  - shared user data → enforce namespace ownership + versioning
  - events → enforce idempotency + retries/DLQ or explicit future seam
  - billing → enforce server-side ledger authority
  - media → enforce quotas/permissions
  - auth/control plane → enforce issuer/JWKS/compatibility handling

9) Optional VS Code / Copilot hints to embed in OUTPUT B
Use when useful:
- `#codebase`
- `#file:<relative-path>`
- `#fetch <URL>` only if external docs are truly needed
- ask Copilot to inspect exact files/functions before editing
- ask Copilot to provide unified diffs or apply_patch-style changes if helpful

10) Optional production SSH inspection block
Only include this in OUTPUT B if the developer’s request clearly calls for production log inspection or live-server debugging.

Rules:
- label it clearly:
  `OPTIONAL — requires explicit developer permission to run against production`
- default mode is inspect-only
- only suggest non-destructive commands initially
- never suggest destructive commands unless explicitly requested later
- require explicit confirmation before any remote execution if autopilot is requested
- remind the developer to redact secrets/tokens/IPs before pasting logs back

If the developer explicitly includes something like `ALLOW_SSH_AUTOPILOT` in `<OPENVIBE_PHASE_REQUEST>`, you may include an optional Autopilot SSH section, but it must still:
- summarize the exact commands first
- require explicit confirmation before execution
- remain non-destructive unless explicitly escalated later

11) Final rule
Return only:
- OUTPUT A
- OUTPUT B
Do not actually implement the changes in that response.

Template input

<OPENVIBE_PLAN_CONTEXT>
<Paste the relevant OpenVibe architecture / migration context here>
</OPENVIBE_PLAN_CONTEXT>

<OPENVIBE_PHASE_REQUEST>
<Paste the current OpenVibe phase / migration / refactor request here>
</OPENVIBE_PHASE_REQUEST>