# ChatFlow Archive Format v2

Status: 0.3 engineering candidate. The reader retains v1 compatibility.

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
assets/<sha256>/000000.bin
assets/<sha256>/000001.bin
```

`conversation.json` is the normalized snapshot payload. It retains the compatible `threadline.snapshot/1` payload schema to avoid lossy rewriting of the source representation. New exports use the `chatflow.archive/2` envelope. Files up to 64 MiB use the single `.bin` entry; larger files use ordered entries of at most 64 MiB each. A payload uses one layout, never both.

## Manifest contract

Required top-level fields:

| Field | Meaning |
|---|---|
| schema | `chatflow.archive/2` for new exports; `chatflow.archive/1` and `threadline.archive/1` also accepted on import |
| formatVersion | Integer `2` for new exports; `1` for the older ChatFlow envelope |
| app | Product name and producing extension version, read from the installed manifest |
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

Each file record contains a unique `key`, `messageId`, `nodeId`, original `name`, `mime`, `kind`, `origin`, `authorRole`, sanitized `ref`, `expectedSize`, `state`, `reason`, `size`, `sha256`, `inLatestSnapshot`, and either archive `path` or `parts` for saved bytes. A v2 `parts` array contains `{path,size}` records in zero-based, six-digit order. All parts except the last are exactly 64 MiB; their sum must equal the full file size. `sha256` always covers the whole reconstructed file. Repeated references to identical content share the payload entries.

## Asset state semantics

- `saved`: non-zero bytes exist under the single path or ordered parts; whole-file size and SHA-256 must match.
- `excluded`: intentionally not downloaded because of the selected save scope; no path or SHA-256 is allowed.
- `unavailable`: a reference exists but no valid bytes were obtained; reason is retained.
- `discovered` / `downloading`: not complete; older imports must not upgrade these to saved. New export is blocked while a capture is running, live caching is enabled, or any file is downloading.
- `corrupt`: local bytes failed integrity verification; never upload as valid.
- `missing` / `unknown`: explicit unresolved states; do not infer absence or success.

## Integrity and path rules

- SHA-256 is calculated over exact uncompressed file bytes.
- ZIP CRC is verified before accepting an entry; ZIP paths reject absolute paths, traversal, control characters, duplicate normalized names and unsupported multi-volume archives.
- `manifest.json` and `conversation.json` must exist; snapshot hash must match before parsing.
- Every manifest asset key must map to exactly one snapshot asset. Duplicate keys, unknown keys, message/node mismatch, forged scope state, missing bytes and mismatched hashes fail closed.
- A `saved` record must point to a non-empty payload and have a 64-character lowercase SHA-256. An `excluded` record cannot carry bytes. Missing, reordered, incorrectly sized or corrupted parts reject the entire restore before any database write.
- The manifest itself is not a claim that the model has read an attachment. Upload and user-send states belong to a separate handoff/experiment record.

## Compatibility

- Import accepts `chatflow.archive/2`, `chatflow.archive/1` and legacy `threadline.archive/1` envelopes.
- New exports emit only `chatflow.archive/2`. Older versions will reject this envelope; use ChatFlow 0.3 or later for v2 backups.
- The compatible snapshot payload is retained; future schema changes must add an explicit migration and round-trip tests rather than silently rewriting source data.
- ZIP restore never overwrites an existing archive identity; imported records receive a new local capture identity if a collision exists.

## Privacy

Signed URLs, cookies, authorization headers, tokens, message body excerpts in diagnostics and file bytes in logs are prohibited. Real user archives remain local and are never used as public test fixtures.

## 有界 ZIP 导出与恢复契约（0.3）

ZIP/ZIP64 兼容不等于允许任意大小的档案恢复。为限制恶意解压和浏览器资源占用，写入器与读取器共享以下边界；调用方不能提高读取器上限：

- ZIP 所有条目累计声明展开大小：256 MiB，包括正文、清单、诊断和所有不重复的附件字节。
- 单条目声明展开大小、单条目压缩载荷大小：各 64 MiB。v2 通过分块支持超过此大小的附件，不增加解压限额。
- deflate 单条目声明展开 / 压缩比：200 倍。
- 逐块解压时再次限制实际输出大小不得超过声明值与上述上限。
- 最多 50,000 条目；中央目录、清单和快照 JSON 分别最多 32 MiB。

导出先在一次只读 IndexedDB 事务中冻结对话、附件和片段元数据。正在采集、开启实时缓存或仍有附件下载时返回 `ARCHIVE_BUSY`，待任务完成或用户显式停止后再备份。静态部分档案可以备份，其缺失文件保持缺失；下载进度字节不混入可恢复大小。已标为保存的附件若缺失或校验失败，导出报错，不把它降级后宣称备份成功。

超过总量或条目边界时，导出在提供下载前返回 `ARCHIVE_EXPORT_LIMIT`。65 MiB 附件使用 64 MiB + 1 MiB 两个条目，可以在总量范围内往返恢复。超过 256 MiB 的整份归档仍不支持备份；当前版本会明确拒绝，不能把这一限制解释为已支持任意大小。

生成 ZIP 后，导出调用恢复使用的同一个解析、CRC、SHA-256、来源、范围和片段校验路径。此阶段不写入数据库；通过后才返回 `verification.restoreValidated: true`。这表示该 ZIP 满足同版本的格式和内容恢复检查，不保证目标设备有足够空间、下载文件永不损坏或缺失的源附件已经取得。真正恢复在全部校验完成后再调用单一原子导入事务。

## Optional Saved Passages metadata (0.2)

ChatFlow archives may include an optional top-level `passages` array in `manifest.json`. Archives created before 0.2 omit it and remain valid. Each passage is separately source-bound to the archive ID, conversation ID, message ID, branch node ID, canonical snapshot SHA-256 and message SHA-256. It also carries excerpt text, prefix/suffix, offsets, occurrence, color and anchored/ambiguous/stale state. Restore validates all references and limits before importing the records under the new local capture ID. Every restore generates a fresh local `passageId` and retains the archived identifier as `originPassageId`, so repeated restores cannot overwrite earlier local passages. Passage metadata never modifies `conversation.json` and never changes attachment bytes. See [SAVED_PASSAGES.md](SAVED_PASSAGES.md).
