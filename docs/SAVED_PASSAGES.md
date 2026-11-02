# Saved Passages — chatflow.passage/1

## Purpose

Saved Passages stores user-selected excerpts as separate local metadata. It never rewrites the original conversation snapshot, source ChatGPT conversation, or attachment bytes.

## Identity

A passage is bound to:

- `captureId`: local archive identity;
- `snapshotHash`: canonical snapshot SHA-256 at creation;
- `conversationId`: source conversation;
- `messageId` + `nodeId`: exact message and branch node;
- `messageHash`: SHA-256 of message ID, node ID, role and text.

The snapshot hash is provenance, not the only freshness check. A later capture snapshot may add unrelated messages; a passage can remain anchored when its original message identity and message hash still match.

## Anchor resolution

1. Find exactly one message with the same `messageId` and `nodeId` in the same conversation.
2. If message hash and saved offsets still select the exact passage text, restore directly.
3. Otherwise search only within that same message for exact passage text.
4. A single candidate is accepted. Multiple candidates require a unique positive prefix/suffix context score; unresolved ties become `ambiguous`.
5. Missing conversation, message or passage text becomes `stale`.

The resolver never searches another message or branch to find a similar phrase. The archive reader exposes the current path and each accessible leaf branch; users can switch paths and jump back to the exact source branch. The “continue this conversation” handoff uses the same selected branch path and records its node IDs, source conversation ID and source snapshot hash in the handoff manifest. Context Builder records the selected path and rejects a passage outside that path unless all accessible branches are explicitly enabled. Ambiguous/stale passages cannot be compiled into a passage-only context package until the user explicitly reselects the passage in its original message. Re-anchoring preserves the original `createdAt`, updates `updatedAt`, and records `reanchoredAt` plus the previous `messageHash` for audit.

## Storage and lifecycle

Passages live in IndexedDB v2 object store `passages`, separate from captures/assets/files/chunks/handoffs. The v1→v2 upgrade adds this store without deleting or rewriting existing records. Deleting a passage does not delete its archive. Deleting an archive cascades only its own passages.

Archive ZIP manifests may include an optional `passages` array. Older archives without it remain valid. Restore validates passage schema, source identity, hashes, offsets, state and color before importing records under the new local capture ID. Each restore generates a fresh local `passageId` and preserves the imported ID as `originPassageId`, so restoring the same ZIP more than once cannot overwrite a previously restored passage.

## Context Builder

- **完整消息**: existing default; no saved passages are implicitly inserted.
- **仅重点片段**: only explicitly selected, anchored passages are compiled.
- **完整消息 + 重点片段**: both are included as separate sections, preserving excerpt boundaries.

The context manifest records passage ID, capture ID, snapshot hash, conversation/message/node identity, message hash, text and offsets. Keyword filtering applies to passage text. Stale or ambiguous anchors fail closed. Budget estimation and complete splitting remain deterministic; no silent truncation or model-generated summary is introduced.

## UI behavior

The local archive reader lets the user select text inside a keyboard-focusable displayed message and save it. Pointer and keyboard text selection are supported. Saved passages are painted with CSS Custom Highlight API where available; the source message DOM text is not wrapped or rewritten. Users can jump to the original message, choose one of four restrained colors, include passages in Context Builder, delete them, or explicitly reselect an excerpt in the same source message when stale/ambiguous.

Real ChatGPT/Edge and human accessibility verification remains a later acceptance phase after engineering and automated tests are complete.
