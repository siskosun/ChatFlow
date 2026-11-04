# ChatFlow 0.1 安全复核

Date: 2026-11-02  
Verified runtime commit: `daa26bed54179c99c55e612bb70ebab649ceba37`  
Evidence: [GitHub Actions run #41392958708](https://github.com/siskosun/ChatFlow/actions/runs/41392958708)

## Confirmed in the current candidate

- Manifest permissions are restricted to ChatGPT hosts and explicitly allowlisted OpenAI media hosts. No `<all_urls>`.
- The active service worker and content scripts route ChatGPT identity, conversation endpoints and media URLs through the provider adapter boundary.
- Source conversation requests are read-only. External media downloads use HTTPS allowlists, omit credentials and referrer, and reject redirects.
- Capture is bound to the selected tab, conversation, origin, document and run nonce. Navigation or identity changes stop the run.
- Assets are persisted as actual non-zero bytes, chunked in IndexedDB, size-checked when the source declares a size, and SHA-256 verified before the saved state is committed.
- Missing, unknown, corrupt and out-of-scope assets remain distinct. Empty file fallbacks are rejected.
- ZIP restore validates manifest schema, version, path, hashes, file scope, message/node references and asset identity. ThreadLine archive v1 imports are covered by a legacy compatibility test.
- Context Builder preserves source references while deduplicating repeated messages and identical attachment bytes by SHA-256. Conflicting archived message versions are retained and flagged.
- Existing drafts and file chips block handoff. Handoff targets must be blank ordinary ChatGPT chats. Project, Temporary, old conversation and unknown destinations are rejected.
- ChatFlow never clicks Send and never silently retries an unknown upload. Upload page observation does not prove that the model read the file.
- Parallel branches bind tab/document, conversation, operation and attempt identity. K=2, K=3 and K=4 synthetic flows all verified manual Send, reply capture and blind comparison.
- The candidate build packages an explicit runtime file allowlist; unused legacy exporter scripts and the unused marked renderer are not shipped.

## Verification evidence

- Node security/regression tests: **89/89**.
- Chromium MV3 synthetic end-to-end: **37 reported cases passed**.
- IndexedDB browser storage-boundary workflow: passed.
- Ubuntu and Windows build/test jobs: passed.
- Candidate Chrome/Edge ZIPs, manifest, runtime-file allowlist and SHA256SUMS: passed build verification.

## Not established

- Current real-account ChatGPT DOM and private endpoint compatibility.
- Actual bytes for real user-uploaded and assistant-generated files, especially old or expired files.
- Real attachment upload behavior and whether the model reads every supplied file.
- Storage quota/large-file pressure beyond the tested fixtures.
- Independent human task success, five-user usability study and screen-reader acceptance.

No production security certification or real-account compatibility claim is made from synthetic evidence.

## 2026-11-02 本机阻断审查与修复收据（追加）

针对原审查对象 `f17b27088d406973bfb89d5495607001d319c18f`，本机验收确认两个阻断：

- P1：并行分支对预填后的 document/conversation 身份绑定不足，可能接纳切换到错误会话的采集。
- P2：ZIP 解压器允许接近 4 GiB 的单条目在内存中展开。

修复方案见 `docs/PLAN.md` §10、`docs/EXPERIMENTS.md` 和 `docs/ARCHIVE_FORMAT.md`。新的控制要求是首次预填 documentId、真实人工发送意图、首次会话 ID、采集前当前文档与标签来源、一致的快照来源；不一致标记 unknown，禁止自动重试。ZIP 导入强制单条目 64 MiB、全部 256 MiB、deflate 压缩比不超过 200，并在展开过程中重复限制。超限大档案暂不支持恢复。

首轮修复 `f0d429d5` 的 Chromium 测试暴露同文档 SPA 路由与历史 MessageSender.url 不一致，导致采集中断。后续 `36012a252fba5ca694629f2b79184577d0e90283` 的 GitHub Actions [#41402106468](https://github.com/siskosun/ChatFlow/actions/runs/41402106468) **Ubuntu/Windows 全部通过**：99/99 Node、30/30 合成 Chromium、7/7 IndexedDB；该收据仅针对准确 SHA，不代表之后的改动已通过。

独立最终审查、已登录账号与真实附件/发送行为、五名独立目标用户、真人读屏、L3 人工 Stop Gate **未执行**。该候选不构成生产安全认证或正式发布许可。

## Saved Passages 0.2 security boundary

- Passage text is stored as text metadata in extension-owned IndexedDB; it is not inserted into source ChatGPT messages or sent to a remote service.
- Every passage is bound to capture, conversation, message, branch node, snapshot hash and message hash. Resolver searches only within the same source message.
- Ambiguous/stale passages cannot be silently mapped to another message; Context Builder rejects them until explicit same-message reselection.
- Selected branch paths are validated as unique, contiguous paths rooted in the accessible graph; disconnected paths are rejected by Context Builder and handoff preparation. Handoff manifests retain conversation ID, snapshot hash and selected node IDs.
- IndexedDB v2 adds one object store; migration preserves existing v1 stores and records. Archive deletion cascades only the deleted capture's passage records.
- ZIP restore validates passage schema and source identity before import. Older archives without passage metadata remain supported.
- UI uses textContent/DOM APIs and CSS Custom Highlight painting; passage text is not interpreted as HTML.
