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

Home has two equal entries: Continue Conversation and Task Return. Each chosen
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

## Visual contract

System fonts, blue-grey palette, generous spacing, equal home cards, visible
keyboard focus and 44px primary targets. Light/dark appearance follows the OS.
Verify 320, 360, 480, 768 and 1280px with no horizontal overflow. Dynamic source
identities and pasted content wrap, and no effect relies on animation.

Render-only screenshots with mocked extension APIs are visual evidence only.
Installed-extension synthetic screenshots and behavior tests are a separate
engineering gate. Real logged-in environments, independent users and human
assistive-technology review remain external gates.
