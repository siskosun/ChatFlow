# ChatFlow 0.1 安全复核

Date: 2026-11-02  
Verified source commit: `bcd2211f4b9e2d388504011c7a8f5fa6a199c18b`  
Evidence: [GitHub Actions run #41392111850](https://github.com/siskosun/ChatFlow/actions/runs/41392111850)

## Confirmed in the current candidate

- Manifest permissions are restricted to ChatGPT hosts and explicitly allowlisted OpenAI media hosts. No `<all_urls>`.
- The active service worker and content scripts route ChatGPT identity, conversation endpoints and media URLs through the provider adapter boundary.
- Source conversation requests are read-only. External media downloads use HTTPS allowlists, omit credentials and referrer, and reject redirects.
- Capture is bound to the selected tab, conversation, origin, document and run nonce. Navigation or identity changes stop the run.
- Assets are persisted as actual non-zero bytes, chunked in IndexedDB, size-checked when the source declares a size, and SHA-256 verified before the saved state is committed.
- Missing, unknown, corrupt and out-of-scope assets remain distinct. Empty file fallbacks are rejected.
- ZIP restore validates manifest schema, version, path, hashes, file scope, message/node references and asset identity. ThreadLine archive v1 imports are covered by a legacy compatibility test.
- Existing drafts and file chips block handoff. Handoff targets must be blank ordinary ChatGPT chats. Project, Temporary, old conversation and unknown destinations are rejected.
- ChatFlow never clicks Send and never silently retries an unknown upload. Upload page observation does not prove that the model read the file.
- Parallel branches bind tab/document, conversation, operation and attempt identity. K=2, K=3 and K=4 synthetic flows all verified manual Send, reply capture and blind comparison.
- The candidate build now packages an explicit runtime file allowlist; unused legacy exporter scripts and the unused marked renderer are not shipped.

## Verification evidence

- Node security/regression tests: **87/87**.
- Chromium MV3 synthetic end-to-end: **37/37 reported cases passed**.
- IndexedDB storage-boundary workflow: passed.
- Ubuntu and Windows build/test jobs: passed.
- Candidate Chrome/Edge ZIPs, manifest and SHA256SUMS: passed build verification.

## Not established

- Current real-account ChatGPT DOM and private endpoint compatibility.
- Actual bytes for real user-uploaded and assistant-generated files, especially old or expired files.
- Real attachment upload behavior and whether the model reads every supplied file.
- Storage quota/large-file pressure beyond the tested fixtures.
- Independent human task success, five-user usability study and screen-reader acceptance.

No production security certification or real-account compatibility claim is made from synthetic evidence.
