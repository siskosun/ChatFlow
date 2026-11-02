# ChatFlow 0.1 归档引擎安全复核

Date: 2026-11-02
Scope: migrated 0.7.2 archive/handoff base at 4e535fa6874c8d54d6e3c858c389e8808626628d.

## Confirmed by source inspection and automated tests

- Manifest permissions are limited to storage, scripting, tabs, downloads and sidePanel; ChatGPT host access is explicit and media hosts are optional/allowlisted. No broad all-host permission.
- Capture requests are read-only; allowed endpoint paths are constrained. External downloads omit credentials and referrer and reject redirects.
- Source capture is bound to tab, conversation, origin, document and run nonce. Navigation or identity changes stop the operation.
- Asset bytes are chunked into IndexedDB, non-empty, size-checked when source size is available, and SHA-256 verified before being marked saved.
- Unknown/unavailable/excluded/corrupt states remain distinct. Empty File fallbacks are rejected.
- ZIP restore validates structure, CRC, paths, hashes, manifest keys, message/node relationships and file-scope semantics.
- New-chat injection requires a blank ordinary ChatGPT page, empty composer and no pre-existing file chips. Project, Temporary, old conversation and unknown destination states are rejected.
- Injection uses File/DataTransfer and does not invoke Send. Upload confirmation is based on observed page state; unknown status returns control without retry.
- Handoff records bind exact target tab/document. Duplicate opens and claims are rejected; deletion of local archives is transactionally isolated from shared binary references.

## Evidence

- Node: 41/41.
- Chromium MV3 synthetic E2E: 21/21.
- IndexedDB browser storage edge tests: 7/7.
- Ubuntu and Windows build/Node jobs: passed.

## Not yet established

- Real ChatGPT endpoint/DOM compatibility for current accounts.
- Real user-uploaded and assistant-generated file bytes, including expired sandbox references.
- Real attachment upload and model-read behavior in new conversations.
- Storage quota and large-file pressure limits beyond tested synthetic fixtures.
- Independent user task success, keyboard/reader acceptance and accessibility.

No claim of production security certification or real-account compatibility is made from the synthetic tests.