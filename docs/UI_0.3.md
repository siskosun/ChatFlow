# 0.3 interaction and reuse record

## Reference evidence (checked 2026-11-03)

- Bonjourr: https://bonjourr.fr/docs/overview/ (redirects to current guides),
  https://bonjourr.fr/. Reference: a calm default surface and optional settings.
- Dark Reader: https://darkreader.org/help/en/. Reference: clear main control,
  scope indication and an additional More layer for advanced configuration.
- Raindrop: https://help.raindrop.io/install-extension. Reference: user-triggered
  capture, minimal required fields and optional advanced workflows.
- GPT-Conversation-Toolkit: pinned commit
  `119d3728bc4cb583d75da72b067a74b1dce90d60`. Actual MIT code ports are enumerated
  in THIRD_PARTY_NOTICES; no artwork or GPL code is bundled.

These are design references, not evidence of universal community consensus or
proof of ChatFlow usability. Prior plan store ratings were not revalidated and
must not be used as a quantitative acceptance criterion.

## Implemented interaction contract

Home has two equal entries: Save and Continue in New Chat (保存并接到新对话) and Task Return (任务回传). The first explicitly opens a different conversation after local capture; the second copies text to an external assistant manually, without any Agent API or automatic Send. Each chosen
workflow has one primary next action. Archives and complex configuration remain
secondary; context assembly, experiments, live caching, passage editing and
diagnostics are off in the default presentation and enabled explicitly.

Turning a feature off hides its entry, not its underlying safety checks or saved
data. The archive backup/restore entry stays reachable. File errors, missing
attachments, unknown uploads and source conflicts stay visible. No permission
is acquired merely by toggling an advanced presentation setting.

The Task Return screen separates creating a marked task from returning a result.
The match preview displays source title, source identity and original task text.
An explicit manual-assignment control appears only when exact matching is
unavailable. Receipt storage and remote sending are never conflated.

ChatGPT page tools are loaded only when requested for a selected source tab.
The panel has a search box, previous/next and question navigation, with export
and formula-copy controls in a disclosure. It uses isolated Shadow DOM, never
modifies the host sidebar or source text, cancels on route changes and closes
with Escape. Source API failure is labelled as loaded-DOM-only coverage.
Messages outside the viewport are located by exact message IDs through bounded
scrolling; failure never redirects to approximate text.

The home and empty-source states explain Chrome 116+/supported Edge, non-incognito mode, logged-in ChatGPT, and the need for an already-existing conversation. No archive offers a first-save next action. Advanced settings show a stable right-hand toggle column and explanatory hints, including a link to experiment documentation.

## Visual contract

System fonts, blue-grey palette, generous spacing, equal home cards, visible
keyboard focus and 44px primary targets. Light/dark appearance follows the OS.
Verify 320, 360, 480, 768 and 1280px with no horizontal overflow. Dynamic source
identities and pasted content wrap, and no effect relies on animation.

Render-only screenshots with mocked extension APIs are visual evidence only.
Installed-extension synthetic screenshots and behavior tests are a separate
engineering gate. Real logged-in environments, independent users and human
assistive-technology review remain external gates.

## Prototype-first revision

The requested `benjitaylor/skills` workflow was applied with the pinned stageshow
skill. The self-contained prototype, editable TSX/CSS, license notices, screenshots
and rehearsal record are in [docs/prototypes/chatflow-0.3](prototypes/chatflow-0.3/README.md).
The production UI was then aligned with those states:

| State | Primary action | Secondary or conditional action |
| --- | --- | --- |
| No saved conversation | 保存对话 | File scope and optional advanced controls |
| Saved conversation | 继续到新对话 | 重新采集; 下载备份 |
| Prepare continuation | 准备历史与文件, then 打开新对话 | Inspect selected messages/files |
| New task | 复制任务 | Source and exact selection confirmation |
| Pasted result | 保存结果, then 复制结果并返回原对话 | Explicit source choice only when required |
| Input above limit | Submission disabled; full text retained | Shorten text without losing the draft |

Archive/task lists use bounded summary pages. Opening a saved result validates
its original task and receipt before replacing the draft; each asynchronous load
is invalidated when the user changes task, input, manual source or workflow.

`tests/ui_visual_e2e.py` checks installed-extension light/dark rendering at 320,
360 and 1440 pixels, horizontal overflow and computed visible text contrast.
`tests/reliability_e2e.py` separately checks trusted clipboard paste and actual
next-action behavior. Neither replaces a first-use human comprehension study.
