# Changelog

All notable changes to ChatFlow are recorded here. Versions 0.1 and 0.2 are engineering candidates, not production releases.

## 0.1 candidate

- Migrated the local-first archive and handoff workflow into the ChatFlow repository.
- Added actual attachment-byte persistence, SHA-256 verification, chunked IndexedDB storage, strict ZIP restore, and legacy ThreadLine archive compatibility.
- Added explicit file save scopes: all files or the last confirmed assistant-generated file on the active branch.
- Added Context Builder with source-linked manifests, branch and keyword filtering, budget-aware complete segmentation, duplicate-message deduplication, identical attachment-byte deduplication by SHA-256, and conflicting-version preservation.
- Added controlled K=2–4 parallel experiments with frozen inputs, manual-only sending, branch-bound capture, blind comparison, calibration and adjudication.
- Added a ChatGPT provider adapter and explicit unsupported behavior for providers without production acceptance.
- Added responsive and keyboard-focused synthetic UX coverage, deterministic Chrome/Edge candidate builds, and CI evidence.
- Real-account ChatGPT acceptance and independent human UX/accessibility studies remain pending.

### PR #1 独立阻断审查后的修复（仍未发布）

- 并行实验增加预填文档、可核对的人工 Send 意图、首次会话与采集完成来源绑定；错归属和身份未知均不得自动完成。
- ZIP 导入新增单条目 64 MiB、累计 256 MiB、deflate 比率 200 的硬限制及恶意样本测试；超限档案暂不支持恢复。
- 修复单页路由改变后历史消息来源 URL 导致的采集中断；保留来源域名、文档及当前会话一致性约束。
- ZIP 安全拒绝在界面显示可理解的中文提示。
- 真实账号、真人 UX 与辅助技术验收仍未完成；PR 保持 Draft。


### 0.2 本机回归问题修复（首次 Edge 实测反馈）

- 并行实验领取流程先检查当前标签页是否存在待领取任务；普通历史对话不再触发 `NOT_NEW_NORMAL_CHAT` 假错误。存在待领取任务时仍严格拒绝旧对话、项目或临时聊天。
- 普通接续改为在工作区所在 Edge 窗口创建新标签页；先持久化标签页与接续任务绑定，再导航到 ChatGPT。
- 新标签页身份核验失败时明确提示，不自动重试、不覆盖已有草稿。
- 已保存的对话现在同时提供“重新采集对话”和“继续这段对话”；同一来源、同一保存范围重新采集会更新原档案，不额外创建重复档案。
- 增加普通历史页无待领取任务、待领取任务仍受新聊天约束、同窗口新标签页、原档案原位更新等回归测试。

## 0.2 engineering candidate — Saved Passages

- Add source-bound Saved Passages with message identity, snapshot/message hashes, offsets and contextual anchors.
- Add deterministic anchored/ambiguous/stale resolution and non-destructive CSS Custom Highlight rendering in the local archive reader.
- Add IndexedDB v2 migration, passage CRUD, archive ZIP round-trip and cascade deletion scoped to the owning capture.
- Add Context Builder full-message, passage-only and mixed modes with passage provenance, explicit accessible-branch selection, and keyword filtering.
- Add same-message explicit re-anchoring, four restrained highlight colors, keyboard-focusable message text, and source-branch navigation.
- Give each ZIP restore a fresh local passage ID while preserving originPassageId, preventing repeated imports from overwriting earlier passages.
- Add current/accessible-leaf branch navigation; Context Builder and handoff preparation use validated selected branch paths and reject disconnected paths.
- Record source conversation ID, snapshot hash and branch node IDs in handoff manifests.
- Preserve passage creation time and re-anchor audit fields, including prior message hash and imported passage lineage.
- Real logged-in account, independent-user, screen-reader and human acceptance remain deferred until all feature development and automated engineering gates are complete.
