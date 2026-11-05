# Source-audited recoverability and downloads (M18/M21)

An imported ZIP can have valid central directory, CRC, SHA-256 and normalized snapshot while the subsequent committed database readback still fails. The restore path now distinguishes database-read errors, snapshot, asset, passage, Blob byte/hash, and receipt-persistence failures; it retains the imported capture and reports that import happened. It never converts missing proof to verified.

The task backup and experiment JSON export now use the existing chrome.downloads permission and onChanged terminal signals. They report started downloads separately from completion or interruption, and keep Blob URLs alive for in-progress browser save dialogs. No legacy HTML export code is brought into the packaged runtime.

Tests are synthetic until exact-head cloud CI; no real-account or manual acceptance is implied.
