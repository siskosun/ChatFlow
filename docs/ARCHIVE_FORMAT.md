# ChatFlow Archive Format v1

Status: 0.1 implementation contract.

## Goals

- Portable ZIP archive that can be validated without ChatFlow UI state.
- Preserve original conversation snapshot, branch graph, asset metadata, real bytes and explicit missing/excluded states.
- Allow old ThreadLine archive envelope v1 to be imported while all new exports use the ChatFlow envelope.
- Never treat a URL, filename or empty file object as stored binary content.

## ZIP layout

```text
manifest.json
conversation.json
conversation.md
diagnostics.json
assets/<sha256>.bin
```

`conversation.json` is the normalized snapshot payload. In ChatFlow 0.1 it retains the compatible `threadline.snapshot/1` payload schema to avoid lossy rewriting of the verified 0.7.2 source representation. The outer archive envelope is `chatflow.archive/1`.

## Manifest contract

Required top-level fields:

| Field | Meaning |
|---|---|
| schema | `chatflow.archive/1` for new exports; legacy `threadline.archive/1` accepted on import |
| formatVersion | Integer `1` for ChatFlow exports |
| app | Product name and producing app version |
| source | Provider (`chatgpt`), conversation ID and origin |
| archiveId | Stable archive/capture identity |
| createdAt / exportedAt | Capture and export timestamps |
| snapshotPath | Must be `conversation.json` |
| snapshotSha256 | SHA-256 of the exact snapshot JSON bytes |
| snapshotSchema | Snapshot payload schema identifier |
| saveScope | `all` or `last_generated` |
| integrity | Snapshot branch/message integrity summary |
| state | `ready` or `partial`; never infer ready from a subset |
| files | Per-asset records |

Each file record contains a unique `key`, `messageId`, `nodeId`, original `name`, `mime`, `kind`, `origin`, `authorRole`, sanitized `ref`, `expectedSize`, `state`, `reason`, `size`, `sha256`, `inLatestSnapshot`, and optional archive `path`.

## Asset state semantics

- `saved`: non-zero bytes exist under `assets/<sha256>.bin`; size and SHA-256 must match.
- `excluded`: intentionally not downloaded because of the selected save scope; no path or SHA-256 is allowed.
- `unavailable`: a reference exists but no valid bytes were obtained; reason is retained.
- `discovered` / `downloading`: not complete; restore must not upgrade these to saved.
- `corrupt`: local bytes failed integrity verification; never upload as valid.
- `missing` / `unknown`: explicit unresolved states; do not infer absence or success.

## Integrity and path rules

- SHA-256 is calculated over exact uncompressed file bytes.
- ZIP CRC is verified before accepting an entry; ZIP paths reject absolute paths, traversal, control characters, duplicate normalized names and unsupported multi-volume archives.
- `manifest.json` and `conversation.json` must exist; snapshot hash must match before parsing.
- Every manifest asset key must map to exactly one snapshot asset. Duplicate keys, unknown keys, message/node mismatch, forged scope state, missing bytes and mismatched hashes fail closed.
- A `saved` record must point to a non-empty payload and have a 64-character lowercase SHA-256. An `excluded` record cannot carry bytes.
- The manifest itself is not a claim that the model has read an attachment. Upload and user-send states belong to a separate handoff/experiment record.

## Compatibility

- Import accepts `chatflow.archive/1` and legacy `threadline.archive/1` envelopes.
- New exports emit only `chatflow.archive/1`.
- The compatible snapshot payload is retained as-is in 0.1; future schema changes must add an explicit migration and round-trip tests rather than silently rewriting source data.
- ZIP restore never overwrites an existing archive identity; imported records receive a new local capture identity if a collision exists.

## Privacy

Signed URLs, cookies, authorization headers, tokens, message body excerpts in diagnostics and file bytes in logs are prohibited. Real user archives remain local and are never used as public test fixtures.