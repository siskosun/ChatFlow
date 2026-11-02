# Changelog

All notable changes to ChatFlow are recorded here. Version 0.1 is an engineering candidate, not a production release.

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
