# Rollout audit findings

## Baseline and failed-run evidence

Source `5030e6b2a315431d17b99bdf70db40d6b0006d4e`, Actions `41842940248`, executed the actual B-D implementation, unlike the pre-application parent run. Node 217/217, the original MV3 main workflow, Task Loop, large-archive readback, task capacity, source-lock and visual checks passed. Two browser checks failed; the overall run is a failure, not acceptance.

1. `storage_edges.py` still asserted database version 4 although the repair intentionally upgrades to 5. Its existing payload/store assertions remain unchanged; the version expectation and historical case labels now identify v5.
2. The new evidence UI test read `count()` immediately after clicking an asynchronously loaded archive. It now waits for the expected report element, then still asserts exactly one element and the correct restore status. No assertion is skipped or timeout budget relaxed.
3. The real v2 fixture exposed an obsolete `passages.message` index that the simplified convergence fixture omitted. The upgrade now removes that known obsolete index while retaining all passage records, and the v2/v4 convergence fixtures include it. The replacement `source` index includes conversation and message identity.

These repairs are source-locked and require a new complete exact-head run. They do not turn old green receipts into acceptance for new code. No real-account or human result is claimed.

## Review boundaries

The supplied engineering review is addressed by repairing actual dependency, migration, diagnostic and maintainability risks. Classic-script loading is retained and checked explicitly, not replaced by a new framework. Archive formats and task formats remain unchanged. Database v5 is an explicit compatibility-preserving index repair, not a claim that v4 can be repaired without an upgrade event.
