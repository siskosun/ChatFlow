# Lightweight Task Loop (0.3)

## Purpose and boundary

A user copies a small task from one ChatGPT conversation to any external Agent,
then pastes the result back into ChatFlow. A local task marker resolves the
original conversation without guessing from a topic or title. No GitHub, Agent
API, remote service, transcript archive or background clipboard watcher is
required. External Agent support means text exchange, not direct integration.

## User path

1. Open Task Return, choose the current conversation and type a task or use a
   selection from one source message. Generate and copy the marked task.
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

IndexedDB version 3 adds `tasks` and `taskResults` without deleting archive or
passage stores. The separate task JSON backup (`chatflow.task-bundle/1`) carries
all task records and receipts. Archive ZIPs remain archive backups; they do not
implicitly contain task records. Task backup import validates identities,
hashes, counts, uniqueness and references, then commits atomically. Existing
source conflicts reject the entire import instead of overwriting records.

## Safety limits

Task text: 20,000 UTF-16 units. Result text: 262,144 units. Local records: 1,000
tasks and 2,000 results. A task backup is limited to 4 MiB. Over-limit input is
rejected rather than silently truncated. A plain-text task exchange carries
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

## Acceptance

`tests/tasks.test.mjs` and `tests/task-service.test.mjs` cover pure data and
service boundaries. `tests/task_loop_e2e.py` exercises the installed MV3
extension, real IndexedDB, identity conflicts, clipboard denial, navigation,
mobile layouts, restart and non-sending behavior with synthetic fixtures.
These do not certify authenticated ChatGPT behavior or human usability.
The current execution record is `../chatflow-0.3.tsm.json`.
