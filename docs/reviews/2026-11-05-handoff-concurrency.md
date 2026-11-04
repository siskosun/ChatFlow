# Handoff state audit — S3/S4

Audited report S3/S4 against main `62e57c33`. Previously, open, claim and receipt each serialized only their own operations. A failed navigation after a successful claim could write a stale full handoff record and remove its document/attempt identity. The new **single write queue** serializes open/claim/receipts/manual acknowledgements/prepare, with a deterministic concurrent-failure regression. It does not claim cross-worker or cross-extension-process atomicity; MV3 worker restarts still recover through existing persisted states.

Identical preparation requests now share a content-addressed `prepareFingerprint` when the existing handoff is still in `prepared`. The UI also suppresses same-button double clicks and invalidates a preparation response if inputs changed while pending. Distinct requests are intentionally **not** silently deleted or overwritten: they may belong to another workspace and contain user-selected material. Cleanup of older distinct preparations requires a separately reviewed retention policy, not a hidden data-deletion side effect.

No autosend, overwrite or silent retry is introduced. Existing validation must pass on the exact PR head; actual logged-in DOM/UX testing is deferred and not claimed.
