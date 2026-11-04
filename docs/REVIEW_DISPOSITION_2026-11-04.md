# Engineering review disposition

Basis: supplied `ChatFlow_Review_2026-11-04.md`; runtime baseline
`dc30f51652e459a417401288a42d64026419565d`. This is a disposition of the supplied
claims, not an assertion that every historical line count remains current.

| Review concern | Bounded disposition | Verification |
|---|---|---|
| Classic-script globals and implicit order | Retain the production architecture. Add explicit build-time load graph for the worker, content scripts, workspace and on-demand tools. | Syntax/order gate plus a real installed-worker `putPassage` round trip; no empty importScripts stub in that check. |
| Existing-store indexes vary by upgrade path | Use IndexedDB v5 so already-v4 databases actually enter the repair. Create/repair missing indexes even on existing stores; abort conflicting store key paths. | Fresh and v1/v2/v3/v4 fixtures converge; payload preserved; bad upgrade remains atomic. |
| Worker lacks TLPassages dependency | Load TLPassages before TLStore in the real service worker. | Actual worker creates and stores a source-bound passage. |
| Drift constants and duplicate algorithms | Share transfer chunk size through TLCore and experiment UI limit through ExperimentCore.MAX_BYTES. Preserve streaming SHA for large files and WebCrypto for small experiment text. | Existing crypto reference tests, chunk/deadline tests and build allowlist. Legacy src/zip.js is excluded from shipped packages; it is not a second runtime ZIP engine. |
| Compressed code | New navigation, evidence, diagnostics and scope boundaries have named functions/contracts; only touched logic is reformatted. | Behavior tests and focused diff review; no claim that every old large function was rewritten. |
| Silent failures | Critical background lifecycle and workspace refresh failures emit bounded, allowlisted diagnostics without raw message, token, URL or stack. Caller-owned rejected queues and cleanup failures retain their original error paths. | Sensitive-marker negative test and 50-record bound. Diagnostics are troubleshooting signals, not a complete transaction log. |
| Missing developer entrypoints | Add package.json/lockfile with no dependencies, editor settings, CONTRIBUTING and native syntax/dependency checks. | npm check/test in Linux and Windows CI. This does not claim full static type analysis. |
| Dead UI and duplicate assert | Remove adjacent repeated source assertion and unused experiment-note variables/comments; keep actual source binding. | Existing UI/experiment suite. Persisted ThreadLine schema names intentionally remain for compatibility. |

## Separate rollout gates

A: source/attachment/parse limits; B: message navigation with normal and reverse
virtualized positive controls; C: exact ZIP parser evidence versus committed database
readback; D: per-file page observations and user attestations; E: optional source-bound
answer headings. E must not be required to pass B-D. The integrity report never equates
file hashing with complete provider history. No automatic send or retry is introduced.

## Evidence boundaries

A local save, a validated generated ZIP, an initiated download, a completed database
import and a successful post-commit readback are separate events. Verification receipts
are versioned and bound to the content subject and exact ZIP SHA-256. Source changes
make old receipts historical. A partial archive may be structurally valid and restorable.

Per-file results are bound to the frozen handoff, batch index, content hash, upload name,
attempt and target document. Page-ready requires unique exact filename evidence; late
or foreign receipts cannot overwrite a terminal record. User acknowledgement is not
provider receipt, model reading or message sending. Legacy records do not acquire
per-file confidence merely because an old aggregate state said upload_confirmed.

No real-account or human acceptance is asserted by this document. Exact-head CI and
Checkpoint entries are the authoritative engineering results.
