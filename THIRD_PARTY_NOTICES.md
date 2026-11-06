# Third-party notices

## ChatGPT Markdown Export

Repository: https://github.com/thekester/chatgpt-export  
Pinned commit: 13568bf75688de74a5af563b20d5ccd28f4ad532 (v0.6.59).  
License: MIT. The upstream copyright and license text are preserved in LICENSE.

The candidate package does not ship the upstream exporter scripts verbatim. `src/tl-capture.js` adapts the read-only endpoint/capture pattern, and `src/tl-archive.js` adapts the ZIP record layout from the pinned upstream implementation. The older upstream `content.js`, `picker.js`, `render.js`, `zip.js`, and marked renderer remain in the repository for provenance and audit only; the candidate build explicitly excludes them. ChatFlow's archive validation, local-storage orchestration, and user interface are separate integration code. Destructive source-conversation actions are not part of the active ChatFlow runtime.

## MoveChat

Repository: https://github.com/VC067/MoveChat  
Reference commit: c4fdb698c09c8be4fbe572ab8a7420bd1e0deb0f (v1.2.1).  
License: MIT.

MoveChat informed the safe new-chat File/DataTransfer interaction, page identity checks, and adapter boundary. ChatFlow does not include its autoSend path, Send-button automation, or empty-file fallbacks. No MoveChat source files are bundled as-is in this migration.

## Other components

- The marked renderer is retained in the source repository for provenance but is not included in ChatFlow candidate packages.
- No external runtime scripts or cloud services are loaded.

## Design prototype only: Stageshow and React

`docs/prototypes/chatflow-0.3/` contains a design prototype based on
[benjitaylor/skills · Stageshow](https://github.com/benjitaylor/skills/tree/802057409787133703c56001080169e347305572/stageshow),
pinned at `802057409787133703c56001080169e347305572` (MIT).
The copied kit subset and static-card example retain the upstream
[LICENSE](docs/prototypes/chatflow-0.3/vendor/stageshow/LICENSE) and
[NOTICE.md](docs/prototypes/chatflow-0.3/vendor/stageshow/NOTICE.md).

The standalone prototype bundles React 18.3.1, React DOM 18.3.1 and Scheduler
0.23.2 (MIT). Their complete license notices are preserved in
[REACT_LICENSE.txt](docs/prototypes/chatflow-0.3/REACT_LICENSE.txt),
[REACT_DOM_LICENSE.txt](docs/prototypes/chatflow-0.3/REACT_DOM_LICENSE.txt) and
[SCHEDULER_LICENSE.txt](docs/prototypes/chatflow-0.3/SCHEDULER_LICENSE.txt).
These dependencies are used only in the documentation prototype and are not
included in the candidate extension packages. See the prototype's
[README](docs/prototypes/chatflow-0.3/README.md) for build provenance and scope.

## ThreadLine Fork experiment engine

Repository: https://github.com/siskosun/ThreadLine  
Reused files: threadline-extension/ff-core.js and threadline-extension/ff-db.js, plus the original experiment page interaction structure.  
License: MIT. The copyright and permission notice are reproduced below.

MIT License

Copyright (c) 2026 ThreadLine contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## GPT-Conversation-Toolkit portions (0.3)

Upstream: https://github.com/bujue3709/GPT-Conversation-Toolkit
Pinned commit: `119d3728bc4cb583d75da72b067a74b1dce90d60` (v1.4.5).
Adapted in `src/toolkit-port.js`:

- `features/export-formatters.js`: JSON, Markdown and text formatting.
- `features/export-normalizer.js`: `groupExportMessagesIntoTurns`.
- `features/search.js`: `getSearchMatchRanges` with source-offset preservation.
- `features/virtualized-jump.js`: exact DOM message-ID candidate extraction.

ChatFlow adds stable source identities, explicit subset/coverage labels, Unicode
source-offset mapping and bounded matching. Its source-bound controller and
Shadow DOM UI are implemented separately; fuzzy jumps, automatic global scans,
DOM rewriting, API-origin fallback and the upstream complete toolbar are not
imported. This is component reuse, not a wholesale port or an upstream security
endorsement. UI design references are not bundled code or images.

MIT License

Copyright (c) 2026 bujue3709

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## ChatTrail navigation calculations

Repository: https://github.com/hzhang092/chattrail
Pinned commit: `f894aa82440281dc2f99e2427dd5f67d6a0c6efc`.
Source: `extension/chatgpt-initial-jump-utils.js` stable-frame / scroll-correction
calculations, adapted in `src/tl-navigation.js`. No timeline UI, source identity,
localStorage or fuzzy matching implementation is imported. Reverse-scroll and
current markup handling also use observations from AI-Chat-TOC; its authentication,
text-prefix matching and complete controllers are not imported.

MIT License

Copyright (c) 2025 Reborn14

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## Second implementation review (2026-11-05)

The following sources informed narrowly scoped, independently integrated changes.
No complete upstream application, DOM collector, state store or runtime framework
is added. Source-specific file references and rejected behaviors are documented in
`docs/reviews/2026-11-05-open-source-round2.md`.

- Threadmark, MIT, `95962bd3d09d48f6537e83f6cada4b1ca87bfd2f`:
  https://github.com/ccheney/threadmark — temporary observation of a delayed native
  selection toolbar. ChatFlow retains its independent Shadow DOM button.
- penciled, MIT, `feeb55e144f0a35c867fb2c0dcfd7c950af015d0`:
  https://github.com/marcellosso/penciled — measured floating-control placement and
  cancellation lifecycle. No penciled or Floating UI runtime is bundled.
- pionxzh/chatgpt-exporter, MIT, `ce5987a328a95945777bcdac6b953855424fac22`:
  https://github.com/pionxzh/chatgpt-exporter — message-local content-reference
  fields and source-link export. ChatFlow preserves raw text and unsupported
  markers, and uses its own bounded, code-aware projection.
- ContextBridge, Apache-2.0, `35e23a261683769f2a976055fa91ba9e2ae6ec00`:
  https://github.com/vinchlabs/contextbridge — design reference for a shared
  attachment/source/upload-name mapping. No ContextBridge source is copied.
- Multi-AI Chat, MIT, `c93fef795b7209e8a95e7276352149b40417d5de`:
  https://github.com/TED-H-com/multi-ai-chat — design reference for tab ownership
  and stale asynchronous states. No provider automation is copied.

Sidenote's inspected package declares UNLICENSED. Its code is not reused.
Relay Chat Handoff has an MIT statement in its README but no separately identified
project license file in the inspected tree; its code is not reused.


### Threadmark license notice

MIT License

Copyright (c) 2025 Threadmark contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


### penciled license notice

MIT License

Copyright (c) 2026 Marcel Losso

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


### pionxzh/chatgpt-exporter license notice

MIT License

Copyright (c) 2022-Present Pionxzh

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


### AI Chat TOC keyboard interaction reference

[harshmann10/AI-Chat-TOC](https://github.com/harshmann10/AI-Chat-TOC), MIT,
pinned at `d76407ceb80b5ff8f104a7ec38752e7a2e5cf0d3`, `src/ui.js`
SearchManager: Escape clears a nonempty search before leaving the search state.
ChatFlow independently adapts this small interaction to its source-bound floating
panel. The upstream empty-search behavior is blur; ChatFlow closes its panel.
No upstream search manager, DOM collector, scroll engine or runtime is copied.
