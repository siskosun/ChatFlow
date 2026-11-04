# Saved Passages — chatflow.passage/1

## Purpose

Saved Passages stores user-selected excerpts as separate local metadata. It never rewrites the original conversation snapshot, source ChatGPT conversation, or attachment bytes.

## Identity and write validation

A passage is bound to `captureId`, the canonical snapshot SHA-256 at creation (`snapshotHash`), `conversationId`, the exact `messageId` and `nodeId`, and the SHA-256 of message identity, role and text (`messageHash`). Creating or replacing an anchor checks the actual canonical source message and exact text offsets, not merely copied identifiers. Empty text, mismatched hashes, invalid offsets or a different source are rejected before persistence.

The snapshot hash is provenance, not the only freshness check. A later snapshot may add unrelated messages; a passage can remain anchored when its original message identity and message hash still match. Hashes establish local content consistency, not external authenticity.

## Anchor resolution

1. Find exactly one message with the same message and node IDs in the same conversation. A changed author role is stale.
2. If the message hash and saved offsets still select the exact passage text, restore directly.
3. Otherwise search only within that same message for exact passage text, including overlapping occurrences.
4. Accept a single exact candidate. With multiple candidates, require a unique best prefix/suffix score of at least eight matching characters; otherwise return `ambiguous`.
5. Missing conversation, message or passage text becomes `stale`. Do not search another message or branch to find a similar phrase.

The archive reader exposes the current path and each accessible leaf branch. Users can switch paths and jump to the exact source branch. The handoff uses the selected branch path and records its node IDs, source conversation ID and source snapshot hash. A changed branch or source snapshot invalidates an already prepared handoff; the background checks source freshness again before opening a target window.

Context Builder rejects a passage outside the selected path unless all accessible branches are explicitly enabled. Unresolved anchors cannot be compiled. Explicit same-message re-anchoring preserves `createdAt`, color and origin identity, updates `updatedAt`, and records `reanchoredAt` plus `previousMessageHash`. The original snapshot is unchanged.

## Storage and lifecycle

Passages live in IndexedDB v2 object store `passages`, separate from captures/assets/files/chunks/handoffs. The v1→v2 upgrade adds this store without deleting existing records. Deleting a passage does not delete its archive. Deleting an archive cascades only its own passages. A late success after an abandoned blocked database open closes the unused connection.

Archive ZIP manifests may contain an optional `passages` array; older archives without it remain valid. Restore validates metadata and all file bytes before committing files, capture, asset references and passages in one transaction. Failed imports do not commit partial blobs. Multiple legitimate references to the same content-addressed file are supported; conflicting sizes are rejected.

Every restore generates a fresh local `passageId` and retains the original ID as `originPassageId`, preventing repeated restores from overwriting earlier passages. A quotation whose source message has disappeared can be backed up as explicitly `stale` with `MESSAGE_NOT_FOUND`; restore never upgrades it to anchored or makes it eligible for context compilation.

Limits: 5000 UTF-16 code units per excerpt, 5000 passages per capture, and 32 MiB for the exported manifest. ZIP restore retains the documented 64 MiB per-entry, 256 MiB total expansion and 200:1 deflate limits.

## Context Builder

- **完整消息**: default; even caller-supplied passage records are not implicitly inserted.
- **仅重点片段**: only explicitly selected, currently resolvable passages are compiled. Sources with no selected passages after filtering are recorded in `excludedSources`.
- **完整消息 + 重点片段**: full messages and excerpts remain separate sections.

The manifest records current resolved hashes and offsets, identity and text. `anchorAtSave` retains the original snapshot/message hashes and offsets, and `resolution` explains the match. This prevents a moved excerpt from being emitted with an obsolete source location. Duplicate passage IDs are rejected. Graph-path order determines message order, not IndexedDB insertion order.

Keyword filtering applies to selected passage text. Stable `contentHash` covers compilation options, sources, passages, assets and parts; the generation timestamp is excluded. Budget estimation and complete splitting do not silently truncate content or invent summaries.

## UI behavior and evidence boundary

Inside a focused archived message, Shift+Left/Right, Shift+Home/End and Ctrl/Cmd+A operate on that message's selection without making the text editable. Arrow extension respects surrogate pairs. Pointer selection remains available. CSS Custom Highlight paints marks without wrapping or rewriting source text. Asynchronous archive renders publish only while their selection and render generation remain current.

Users can jump to the source, change one of four colors, select excerpts for context compilation, delete them, or explicitly re-anchor within the same source message. Failure states remain visible rather than being silently relocated.

The engineering receipt in `PLAN.md` includes actual browser keyboard events, archive/context/handoff integration and real Chromium IndexedDB tests using synthetic data. Logged-in ChatGPT/Edge compatibility, independent-user usability and human assistive-technology acceptance remain a separate later phase.
