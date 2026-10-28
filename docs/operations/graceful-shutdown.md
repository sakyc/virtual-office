# Graceful shutdown — single worker

Normal PM2 restart/stop sends SIGINT; system supervisors often use SIGTERM. Both
now start the same idempotent drain. The first signal stops HTTP admission and
closes the listener. Already connected requests that reach middleware during drain
receive 503 SERVER_DRAINING with Retry-After: 30 and Connection: close. No public
shutdown endpoint exists. Authorization and paid-access gates are unchanged.

The lifecycle tracks HTTP responses, tenant and paid-gate admission, task/revision
reservation handlers, detached tasks (including revision failure recovery), both
chat generation handlers, legacy API handlers/workers, and DB initialization.
It waits for tracked work and server connections before ending the MySQL pool.
Tracking handlers separately from responses retains work after disconnect/202
and includes post-response cleanup. Chat abort, completion and billing policies
remain those of the existing handlers; shutdown never replays an AI request.

Application deadline: 300,000 ms (5 minutes). PM2 kill_timeout: 330,000 ms.
No unconditional closeAllConnections is used during drain, so active SSE is not
cut off just to speed up deployment. On expiry, a sanitized warning with the active
count is logged and the process exits with code 1. It does not close the pool
under active work, refund holds, mark uncertain usage successful, or auto-retry.
Normal completion exits 0; repeated signals do not start a second drain.

## Deploying the change

Use only the cPanel account owning the actual Karyora PM2 process. Previous
deployment output has shown both root and vetencode PM2 lists: determine the real
owner and remove no process blindly. Never start a second instance on port 3101.
The old running process has no drain until this release starts, so the first
update still requires all paid jobs/revisions/chat streams to finish first.

After committing/pushing reviewed source and pulling/installing/building as that
owner, include the longer PM2 kill deadline when restarting from the ecosystem:

```sh
pm2 restart deploy/ecosystem.config.cjs --update-env
pm2 describe karyora
pm2 save
```

The initial old-process restart is not protected retroactively. Validate that
the process-manager kill deadline is 330 seconds; don't depend on the default
1.6-second PM2 timeout. Subsequent restarts of this release drain tracked work.
Review shutdown/start logs privately; no prompts or credentials should be shared.
No migration is required. Do not use pm2 restart all or kill an unrelated worker.

## Limits, not a durable queue

- A crash, SIGKILL, OOM, host reboot/power loss, or deadline expiry still interrupts
  work. There is no durable resume, lease-based queue, or automatic paid retry.
- Existing initDb remains unchanged: on startup it executes legacy schema SQL and
  marks generating jobs failed/revising items draft. It does not reconcile money.
- Unknown billing reservations/evidence still require the existing operator
  reconciliation workflow. Never assume cancellation means the provider was free.
- Draining starts only on shutdown signals; normal live request paths remain
  available before that. There is no automatic maintenance dashboard/readiness
  service. Apache may temporarily return 502/503 while the single worker restarts.
- Keep one worker. Concurrent old/new workers share global startup recovery and
  are not supported by this change; do not use PM2 cluster/zero-downtime reload.
- Untracked third-party module activity and non-AI auth/admin work after an HTTP
  disconnect are not a transactional global queue. Deadline remains bounded.

Tests: `node --test test/work-lifecycle.test.js`, plus task/chat/review/auth
regressions. Tests use local HTTP and deferred mock work, no actual DB/provider.
They cover detached jobs, disconnect during reservation, SSE and post-response
settlement, new-request rejection, errors, repeated shutdown, and timeout without
replay or early resource closure. Real PM2 signal timing on the VPS remains to be
verified during a controlled release, not by interrupting paid customer work.

Local regression verification (28 October 2026): all 392 tests passed using
`node --test --test-concurrency=4` across `test/*.test.js`, including the eight
lifecycle tests. No development/production database or paid provider was used.
