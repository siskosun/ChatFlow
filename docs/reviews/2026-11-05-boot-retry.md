# Startup recovery: audit S2

Previously one transient IndexedDB upgrade block or session-storage failure latched `bootError` until the MV3 service worker was recycled. The new worker initializes through `startBoot`, keeps the failure code, and accepts **only a trusted workspace** `tl:retryBoot` after an explicit user gesture. Concurrent retry clicks share one initialization attempt; normal commands are never auto-replayed.

The workspace shows an explicit retry button on known startup/extension-storage failures. Retrying reopens the local store, reinitializes the worker, and rebuilds the visible source and archive controls; it does not delete existing records, resend a ChatGPT message or silently create a new handoff. A synthetic worker test injects a transient startup failure and verifies recovery plus foreign-source denial. Exact-head CI still required.

Non-startup initialization failures (such as individual quota display problems) are not claimed fixed by this focused patch; they will be handled as separate UI degradation reviews rather than conflating all errors with a worker boot failure.
