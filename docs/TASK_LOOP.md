# Lightweight Task Loop (0.3)

## Purpose and boundary

A user copies a small task from one ChatGPT conversation to any external Agent,
then pastes the result back into ChatFlow. A local task marker resolves the
original conversation without guessing from a topic or title. No GitHub, Agent
API, remote service, transcript archive or background clipboard watcher is
required. External Agent support means text exchange, not direct integration.

## User path

1. Open Task Return and choose the source conversation. Type a task, **or**
   click "接收原对话选文" once, then select text inside a single ChatGPT message.
   The armed side panel fills the draft automatically; no second click is needed.
   A pre-existing selection can also be read immediately after arming. The panel
   displays a clear awaiting/success/uncertain status. Review the draft, then
   explicitly choose "复制任务" to create and copy the marked task.
2. Ask the Agent to retain the exact marker on the first nonempty result line.
3. Paste the result, inspect the source preview and save the local receipt.
4. Copy the result and return to the original conversation. Paste, review and
   Send manually. Clipboard denial exposes selectable text and an open-only
   action; it never reports a successful copy.

Same-topic, same-title tasks remain separate. Multiple receipts are kept; an
identical result for the same task is idempotent. A marker is a routing hint,
not authentication, correctness evidence or proof the Agent executed a task.

## Identity and persistence

`chatflow.task/1` holds a UUID, a collision-checked random 12-character marker,
canonical HTTPS source origin/conversation ID/URL, optional real message/node
IDs, task text, text hash and creation time. Missing message identities remain
null. Browser tab IDs are only transient read handles, not persistent keys.

`chatflow.task-result/1` holds its own UUID, task identity, result text/hash,
assignment basis (`marker_matched` or `manual_assigned`) and receipt time.
Task IDs and source bindings are immutable. There is deliberately no automatic
"sent" or "accepted" state. Opening a tab means only `source_opened_not_sent`.

IndexedDB version 4 preserves `tasks` and `taskResults` and adds small
`taskSummaries` and `taskResultSummaries` stores plus temporary `taskImportRows`.
Upgrade builds summaries with cursors, without collecting the original bodies
in an array. A task summary carries its source, marker, a 180-unit preview,
creation time and receipt count. A receipt summary carries identifiers, hash,
assignment basis and creation time, never the result body. Summary writes and
original-record writes share one transaction.

Task backup exports `chatflow.task-backup/2` as JSON Lines (`.jsonl`). A header
fixes task/result counts; one bounded line holds each task or receipt; a final
record carries counts and SHA-256 over the preceding exact UTF-8 lines. The
writer takes one readonly IndexedDB snapshot, validates each record, and builds
Blob parts one record at a time. It does not stringify the entire library or
read the library's results with `getAll()`.

Restore reads at most 256 KiB per slice and rejects lines larger than 2 MiB
before JSON parsing. It validates source identities, record hashes, counts,
uniqueness, references, UTF-8 and the final digest. Records are staged in batches
of eight; only after all checks pass does one transaction merge the entire
backup into live records and summaries. A conflict, storage failure or bad
footer leaves the original library unchanged. Same-origin Web Locks serialize
imports. Startup cleanup removes interrupted staging only when no import holds
the lock; staging is never exposed as saved tasks. Temporary staging requires
available browser storage during restore.

Old `chatflow.task-bundle/1` JSON files remain importable with the original
4 MiB file-read bound. The legacy in-memory `bundle()` / `restore(object)` APIs
remain for compatibility; the UI uses the streaming file APIs. Archive ZIPs
remain archive backups and do not implicitly contain task records.

## User-armed selection relay (browser UI)

An explicit click on "接收原对话选文" injects the small on-demand
`tl-task-selection.js` relay into the **selected** ChatGPT tab. The extension
binds a one-shot `chrome.tabs.connect` port to that tab's exact Chrome document ID.
Only while this port is connected does it listen for selection changes.
After one valid selection it disconnects; leaving the task page, switching source,
typing into the draft, navigating away, or closing the sidebar also disarms it.

It accepts selected text only from one message inside the uniquely visible
conversation container on the selected tab, checks the canonical source URL
and document scope, and refuses cross-message, hidden/outgoing or over-20,000-unit
selections. The text is **not** sent to a server, copied to the clipboard,
written to a task, or sent to another Agent until the user takes a separate action.
An existing edited draft is never silently overwritten.

Some ChatGPT page variants do not provide the optional
`data-chatgpt-selection-conversation-id` DOM marker. When the visible thread
is unique but that marker is absent, a user-selected message can populate a
**draft with an explicit unverified-source warning**. It must not be described
as independently verified, nor should an unverified message ID be elevated
to confirmed. If the thread is ambiguous or the selection leaves a single
message, nothing is imported. This does not imply authenticated-account
acceptance; it is covered by synthetic MV3 fixtures and still needs real-page QA.

## Safety limits

Task text: 20,000 UTF-16 units. Result text: 262,144 units. Local records: 1,000
tasks and 2,000 results. The v2 backup has the same record-count limits as the
live library and a 2 MiB UTF-8 limit per JSON line. This covers even the worst
JSON escaping of every allowed 262,144-unit result. The outer file bound is
`3002 × (2 MiB + 1 byte)`; ordinary valid records are much smaller. There is no
4 MiB whole-library limit for new exports. Over-limit input is rejected rather
than silently truncated. A plain-text task exchange carries
no source URL, credentials or transcript beyond the selected task text.

Only a standalone marker on the first nonempty line can automatically bind a
result; conflicting standalone markers fail closed. Missing, unknown, malformed
or conflicting markers require a displayed manual task choice plus explicit
confirmation. Manual assignment is retained as such, never promoted to an
automatic match. No similarity matching or hidden cloud lookup is used.

Source selection is checked before and after page access; route changes block
creation. Only the owning extension workspace can invoke privileged Task Loop
commands. Return URLs are read from validated local records, not the Agent's
result. Return opens or focuses the exact source in the workspace window and
never injects into an existing composer. The existing blank-new-chat-only
handoff path is unchanged.

## Failure behavior

Deleted or inaccessible remote conversations may open an error page: ChatFlow
does not claim that opening the stored URL proves the chat still exists.
Different browser profiles have independent stores; use explicit backup/import
or manual association, not an invented automatic match. Tasks can be deleted
locally with confirmation; this cascades only their receipts, never remote
chats or archive files. Import files and Agent outputs are untrusted data.

## List performance

`listPage({limit:25,cursor})` reads `taskSummaries` in descending `[createdAt,id]`
order. `resultPage(taskId,{limit:25,cursor})` reads the matching receipt-summary
index. The maximum page size is 100; each request reads only one extra summary
to decide whether a next page exists. `taskChoices()` reads at most 1,000 small
summaries for manual source selection. `match(text)` looks up one task by its
unique marker index. Full task/result bodies are loaded only for the selected
item through `get(id)` / `getResult(id)`.

The cloud Chromium regression seeds 1,000 tasks (about 2 KiB each) and 2,000
receipts (about 4 KiB each), exports/restores that full-count library, and fails
if metadata pagination touches original bodies. Runner budgets: first metadata
page <1,500 ms, ten-page p95 <500 ms, and full-count fixture restore <60 s.
These are engineering gates for the pinned CI environment, not timing promises
for a user's browser. A separate fixture tests sixteen maximum-size receipts.
The test report records actual bytes and timing; a missing report is not a pass.

## Acceptance

`tests/tasks.test.mjs`, `tests/task-service.test.mjs` and
`tests/task-reliability.test.mjs` cover pure data, record-size, streaming format
and service boundaries. `tests/task_storage_v4.py` checks actual Chromium
IndexedDB migration, real export/restore above 4 MiB, atomic failures,
interrupted staging cleanup and full-count summary pagination. `tests/task_loop_e2e.py` exercises the installed MV3
extension, real IndexedDB, identity conflicts, clipboard denial, navigation,
mobile layouts, restart and non-sending behavior with synthetic fixtures.
These do not certify authenticated ChatGPT behavior or human usability.
The current execution record is `../chatflow-0.3.tsm.json`.
