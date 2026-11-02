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
