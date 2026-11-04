# Source-bound answer headings

This optional increment adds answer headings inside the existing on-demand conversation tools. It creates no new homepage entry, storage collection, permissions or external service.

Expand an answer to read its rendered H1-H6 headings. If it is virtualized, explicitly locate that answer first. Clicking a heading restores the exact parent message, then resolves the heading within that message. Duplicate headings are distinguished by level and occurrence, and the complete message/outline hashes must still agree. A remount with unchanged content is allowed; edited content is not silently guessed.

The heading scanner uses actual rendered headings, not a Markdown renderer. Code/pre blocks, accessibility-only and hidden/inert content are excluded. Labels are textContent, never HTML. The scan is capped at 256 headings, 1,000 characters per label and 1 MiB of message text. Source leases, cancellation and navigation budgets are shared with the existing message navigator. Failure to locate a heading does not become a false section success.

The direct heading implementation is local code; LunaTOC's outline interaction was a design reference, not an imported React/controller dependency. ChatTrail's already-attributed navigation calculations remain unchanged by this increment.

Acceptance is the independent headings Node/installed-MV3 suite together with retained B-D regression, not a claim about a logged-in ChatGPT account.
