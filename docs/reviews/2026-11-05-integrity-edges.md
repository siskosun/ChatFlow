# Post-merge integrity audit (M4, M6, M10, M13, M19, M20)

Source: user-supplied code review against `62e57c33`. This PR preserves the existing archive/task formats and the authorized ChatGPT source and upload contracts.

- M4: preserve every non-secret URL byte, strip only signed/authorization query fields without round-tripping through URL.href. Support HTTP and HTTPS. Ambiguous percent-encoded query keys result in dropping the query (fail closed).
- M6: actively cancel the in-flight content-side file reader on stop and check source identity on every encoded chunk.
- M10: capture error cleanup writes only if the capture record exists, and cannot obscure the original exception.
- M13: Windows device basenames and trailing periods are rendered safe.
- M19/M20: Unicode-normalized ZIP entry lookup and ZIP64 locator bounds are explicit.

Tests include byte-preserving URL redaction and Windows file names. Source-lock and archive ZIP security regressions remain required; passing synthetics cannot replace actual authenticated usage. No code from obsolete legacy sources was moved into the runtime.
