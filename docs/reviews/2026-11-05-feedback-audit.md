# Post-merge code audit: visible error handling and verdict form

Reference: supplied “ChatFlow 0.3 代码审核报告”, main commit `62e57c33`.

This PR addresses S1 (bounded user-facing error explanations) and S7 (non-empty verdict rationale), plus M2 (disable confirmation until the checkbox is selected) and M14 (empty conversation explanation). Stable recognized experiment-core messages map to specific codes at the background boundary. Unknown exceptions must not print user text or tokens to console/diagnostics; the UI displays an actionable generic message or a bounded uppercase status code. The independent user-input/experiment ownership gates remain unchanged.

The audit's proposal to console.error every caught Error was **not** adopted: arbitrary exceptions can contain user-provided text, signed URLs and credentials. This project intentionally never logs those to GitHub or extension diagnostics. The proposed automatic synchronization of experiment visibility and experiment opt-in was likewise not bundled with this error-only PR; those govern different permissions and should be evaluated separately.

Code is an engineering candidate pending exact-head Node, installed-MV3 synthetic, Windows and byte-reproducible build checks. No authenticated or human acceptance is claimed.
