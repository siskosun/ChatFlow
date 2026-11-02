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
