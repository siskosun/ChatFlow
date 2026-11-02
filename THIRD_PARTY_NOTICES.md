# Third-party notices

## ChatGPT Markdown Export

Repository: https://github.com/thekester/chatgpt-export  
Pinned commit: 13568bf75688de74a5af563b20d5ccd28f4ad532 (v0.6.59).  
License: MIT. The upstream copyright and license text are preserved in LICENSE.

Bundled upstream-derived components include the read-only capture/rendering pipeline, ZIP implementation, and marked renderer. ChatFlow's archive adapter and local-storage orchestration are separate integration code. Destructive source-conversation actions are not part of the active ChatFlow UI or runtime.

## MoveChat

Repository: https://github.com/VC067/MoveChat  
Reference commit: c4fdb698c09c8be4fbe572ab8a7420bd1e0deb0f (v1.2.1).  
License: MIT.

MoveChat informed the safe new-chat File/DataTransfer interaction, page identity checks, and adapter boundary. ChatFlow does not include its autoSend path, Send-button automation, or empty-file fallbacks. No MoveChat source files are bundled as-is in this migration.

## Other components

- `marked` is included under its upstream license in its source header; the pinned upstream project carries the relevant notice.
- No external runtime scripts or cloud services are loaded.
