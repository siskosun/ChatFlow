# ChatFlow 0.2 开发计划与工程验收

**当前状态：工程开发与自动化验收完成；真实环境和真人验收待执行。**

目标仓库：`siskosun/ChatFlow`。目标版本：`0.2`。功能分支：`feature/saved-passages-0.2`。PR #2 保持 Draft/Open，未合并、未发布。PR #1 是本分支包含的 0.1 基线，保持独立，不改变其发布状态。

本文件是唯一正式开发计划。此前计划中以真实账号、五名独立用户或真人读屏作为当前开发前置条件的安排，已由用户明确改为后置验收。工程完成不等于这些测试已经执行，也不等于正式发布获批。

## 1. 已完成的产品范围

ChatFlow 保存用户明确选择的 ChatGPT 对话、可访问分支和能够取得的真实附件字节，在本地提供查找、阅读、校验、导出和恢复，再把选定材料带入新的普通聊天。只预填与附加文件，不自动发送。

0.2 在 0.1 基线上增加重点片段：用户在单条本地历史消息中选择原文，保存独立标注；重新打开时恢复定位和高亮，跳回原消息或原分支，并明确选择完整消息、仅重点片段或混合模式生成上下文包。

当前包含：

- 两种文件保存范围：全部可识别文件；当前活动分支最后一份可确认的助手生成文件。来源未知、无法取得、损坏和主动排除分别显示。
- IndexedDB 元数据、实际 Blob/分块、SHA-256、ZIP/ZIP64、旧 ThreadLine archive/1 兼容和数据库 v1→v2 无损升级。
- 用户明确开启的单对话实时缓存；停止、页面身份变化或后台重启后不静默恢复。
- 档案详情的可访问分支切换、按来源节点跳转、消息正文阅读、附件选择和安全的新聊天接续。
- 重点片段保存、删除、四种颜色、恢复高亮、歧义/失效状态、同消息手动重新定位和重新定位审计信息。
- 鼠标/指针选文，以及聚焦单条消息后的 Shift+方向键、Shift+Home/End、Ctrl/Cmd+A。不把原消息变成可编辑内容。
- Context Builder 的多档案、分支、关键词、三种内容模式、来源索引、完整分段、附件哈希去重和稳定内容哈希。
- K=2–4 并行对照实验：冻结输入、独立新聊天、逐个手动发送、来源绑定采集、盲测和人工裁决。不自动重试未知操作。

不在本版范围内：ChatGPT 原生 Space/Library 深度改造、直接在在线 ChatGPT 页面标注、外部高亮扩展联动、Claude/Gemini 完整适配、云同步、通用 Agent 平台、第二套研究管理系统、超限 ZIP 的流式恢复。这些属于后续候选方向，不是本版尚未兑现的功能承诺。

## 2. 分阶段完成情况

`done` 指相应代码、测试和工程证据完成；不包含后置真实环境或真人体验认证。

| ID | 阶段 | 状态 | 完成依据 |
|---|---|---|---|
| CF-PLAN | 产品范围、基线和执行约束 | done | 本计划及既有来源提交记录 |
| CF-01 | 0.7.2 迁移、品牌与新仓库 | done | 0.1 基线保留；0.2 构建、manifest 和运行时一致 |
| CF-02 | 自有 CI、构建和包校验 | done | Windows、Ubuntu 完整成功；准确提交、包内哈希和版本校验 |
| CF-03 | 归档工程安全复核 | done | 缺失/未知状态、范围约束、ZIP 资源边界、原子导入及负向测试 |
| CF-04 | 统一档案协议与兼容 | done | archive/1、ThreadLine archive/1 往返、哈希与引用验证 |
| CF-05 | Context Builder 基础功能 | done | 来源、分支、关键词、分段、附件去重及冲突版本保留 |
| CF-06 | 受控并行会话引擎 | done | K=2/3/4 合成端到端；旧会话、文档变更和未知状态负向测试 |
| CF-07 | Provider Adapter 边界 | done | ChatGPT 契约测试；其他平台不宣称支持 |
| CF-08 | 真实账号验收 | deferred | 合并到 CF-16，未执行 |
| CF-09 | 界面工程与自动化无障碍检查 | done | 五种视口、焦点、状态提示、真实键盘事件和主操作检查；真人部分归 CF-16 |
| CF-10 | 0.1 工程候选基线 | done | 基线代码已纳入本轮集成回归；不改变 PR #1 发布状态 |
| CF-11 | Passage 数据层 | done | 独立 passages store、v1→v2、来源/hash 校验、删除边界与重复导入保护 |
| CF-12 | 锚点与恢复引擎 | done | 精确偏移、同消息回退、上下文消歧、角色变化、重叠文本和分支隔离 |
| CF-13 | 档案阅读与片段交互 | done | 键盘选文保存、高亮、颜色、来源分支跳转、删除及重新定位实现 |
| CF-14 | 片段上下文与分支接续集成 | done | 三模式、当前定位与原始定位双重来源、分支路径、来源变化失效和内容哈希 |
| CF-15 | 0.2 集成、回归与候选交付 | done | 本文第 3 节准确运行时代码全绿；构建包已逐文件校验 |
| CF-16 | 后置真实环境与真人验收 | deferred | 工程阶段完成后执行，未以合成测试冒充通过 |

## 3. 当前可复核验收证据

**最后一次运行时代码验收提交：** `dd60f6bf5e832886f4495bd4db2942ea923be7f3`。
**对应运行：** [GitHub Actions #41637976619](https://github.com/siskosun/ChatFlow/actions/runs/41637976619)。

| 门禁 | 结果 | 证据 |
|---|---|---|
| Ubuntu `verify` | completed / success | Node 132/132，通过；合成 Chromium MV3 47/47，通过；真实 Chromium IndexedDB 合成数据 16/16，通过 |
| Windows `windows-baseline` | completed / success | Python 3.12/Node 22 构建，Node 132/132，通过 |
| `reproducible-build` | completed / success | 下载同一提交的 Windows 与 Ubuntu 构建，逐字节 `cmp` Chrome ZIP、Edge ZIP、`SHA256SUMS`，输出 `CROSS_PLATFORM_BYTE_IDENTICAL` |
| 真实浏览器登录测试 | **未执行** | 不以合成页替代用户的 Edge/Tabbit 真实验收 |

该提交的产物：`chatflow-candidate-dd60f6bf5e832886f4495bd4db2942ea923be7f3`（artifact `13232290213`）。
Windows 构建对照 artifact `13231885951`；合成浏览器及数据库证据 artifact `13231477149`；源码 artifact `13232125173`。

本次修复覆盖：CRLF 与路径排序导致的跨平台构建差异、历史附件行 ZIP 恢复、完整性问题在恢复后被洗白、无来源时保存按钮未禁用、采集失败提示、接续失败后缺少人工重新准备入口。对应验证包括：

- `capture_button_disabled_when_no_chatgpt_conversations_are_open`
- `blocked_handoff_has_an_explicit_reprepare_path_without_automatic_retry`
- `live_dom_placeholder_is_replaced_by_same_message_definitive_attachment`
- `historical_attachment_row_roundtrips_even_if_latest_snapshot_omits_it`
- `source_integrity_issues_survive_zip_restore_without_laundering`

**口径约束：** 本段数值只对上面的准确代码提交及对应运行有效。GitHub 当前 PR HEAD、其自身 CI 和下载产物是后续交付的实时权威；提交新的文档或代码都可能使 HEAD 变化，不得把旧 SHA/测试计数描述为新 HEAD 的验收。0.2 仍是候选版，不能由 CI 全绿推出真实账号已通过或准许发布。

## 4. 本轮关闭的工程问题

键盘选文原先只给静态文本框设置 tabindex，没有实现可用的键盘选择。现已通过浏览器真实 Shift+ArrowRight 事件完成选文、保存和高亮，不把脚本直接创建 Range 当作该用例通过。

异步档案渲染现在先构建独立内容，再按页面选择与递增渲染编号发布。旧请求不能覆盖新选中的档案；来源跳转不再拼接未经转义的 CSS 选择器。

分支变化和来源快照变化均使旧接续包失效。界面、导出和打开目标分别检查来源；后台在创建新标签页前再次核验快照，不只依赖按钮禁用。

片段保存核对实际源消息、角色、正文哈希和偏移。上下文编译输出重新解析后的当前哈希与位置，同时在 anchorAtSave 保留原始锚点。完整消息模式不会偷偷插入调用方传来的片段。

ZIP 恢复对全部字节先校验，再以一个事务提交文件、档案、附件和片段；失败不留下已提交的第一份文件。同一文件的多个合法引用可以恢复；重复导入生成新的本地片段 ID，保留 originPassageId，不覆盖已有片段。来源消息消失的历史片段作为 stale 保留，不冒充定位成功。

CI 对同一分支取消过期运行，并提前检查 Python 语法。没有通过删除原有断言、放宽成功状态或把失败收据改写为成功来完成验收。

## 4.1 后续审查中确认并关闭的问题

- **附件历史记录与恢复：** 实时快照可能保留 `inLatestSnapshot:false` 的历史行。只允许这一显式标记的额外资产行进入恢复，仍逐一校验字节和哈希；其他未知 manifest 资产继续拒绝。相同消息、节点、文件名的未保存 DOM 临时占位符，被新的有效附件引用替代时会消解；已保存的历史字节不会被猜测性合并或删除。最新快照完整性与历史行缺失状态分别记录。
- **原始完整性保全：** 从 conversation.json 重新构建可见消息时，保留哈希校验过的源 `integrity.issues`，避免 `UNSUPPORTED_CONTENT_PART` 或 `VISIBLE_ATTACHMENT_NOT_IN_API` 在 ZIP 恢复后丢失。对 ChatFlow 自身归档要求 manifest 与快照的完整性声明一致。
- **界面状态与恢复：** 没有可用 ChatGPT 来源时主保存按钮处于禁用态；失败或中断的采集可见错误并能重试。已准备的接续遭遇 `injection_blocked` 等非成功终态时允许用户明确再次准备，不自动再次打开目标。
- **位级可复现：** 构建仅对项目文本资源进行 CRLF→LF 规范化，按 POSIX 相对路径大小写敏感排序；ZIP 固定时间戳、Unix 权限元数据，采用无需依赖 zlib 版本的 stored 条目。CI 独立对照 Windows/Ubuntu 包字节而非仅检查包内文件相同。

旧版 ThreadLine 审查中的“仓库只有 PLAN、sidePanel 是默认入口、重复 ZIP 导入先提交 blob”等表述已不符合现行 ChatFlow 0.2：当前仓库包含独立源码，侧栏声明已删除，文件/档案/片段恢复为同一事务。重复导入仍可生成**独立本地档案**，属于保留原归档不覆盖的设计，不等于幂等覆盖。其他未实证的新平台行为（如 Tabbit 默认文件名、真实 ChatGPT 上传控件）继续等待真实环境验证。

## 5. 数据协议与安全边界

重点片段采用 `chatflow.passage/1`，独立于原始 snapshot：captureId、conversationId、messageId、nodeId、snapshotHash、messageHash、原文、前后文、offset、occurrence、颜色、状态及审计时间。

解析首先限定同一消息和分支。消息哈希与偏移一致时直接恢复；否则仅在同一消息内搜索。多个候选要求唯一的上下文匹配且至少 8 个匹配字符；不能区分时返回 ambiguous，找不到原文时返回 stale。不得跨消息猜测。

本版保留以下限制：

- ZIP 恢复单条目压缩及展开大小各不超过 64 MiB，累计展开不超过 256 MiB，deflate 比率不超过 200。超限恢复不受支持，不能通过提高内存阈值绕过。
- 单条片段最多 5000 个 UTF-16 字符，每份档案最多 5000 条。导出 manifest 最多 32 MiB。
- 不自动点击 Send，不覆盖已有草稿，不自动重放未知上传，不修改源对话或项目。
- 不采集未选定对话，不新增全站权限、云端后台或本地常驻服务。
- 原文、真实文件和认证材料不进入公开仓库；测试仅用合成 fixture。
- 哈希证明本地内容一致性，不是外部来源真实性或服务端收件证明。

## 6. 后置验收

CF-16 保留真实登录 Edge/ChatGPT、真实附件可用性、独立目标用户的保存—找回—接续任务、真人读屏、独立最终审查及所有者发布确认。具体步骤见 docs/REAL_ACCOUNT_ACCEPTANCE.md。

这些项目当前没有执行，不记为 pass。它们不再作为继续完成工程开发的阻塞理由。工程候选交付不会自动触发这些测试，不访问用户本机或索取凭据，也不自动合并、发布或提交商店。

## 7. 来源与历史

0.1 基线来自 `siskosun/threadline-chatgpt-export` 的 0.7.2 候选，代码验收 SHA `22999dec5f657e6ba4560f5e589382877afeddad`。采集/归档来源参考 thekester/chatgpt-export 固定提交 `13568bf75688de74a5af563b20d5ccd28f4ad532`；安全接续参考 MoveChat 固定提交 `c4fdb698c09c8be4fbe572ab8a7420bd1e0deb0f`，保留适用许可。

重点片段设计参考 `O0000-code/highlights-for-chatgpt` 的无破坏高亮、文字锚点和原文回跳思路；ChatFlow 的独立来源身份、恢复与上下文协议按本项目约束实现，不整体移植在线 Library/Space 改造。

历史失败、修复和验收记录仍在 Git 提交及 Actions 中。`1d43c1fe322e6cc5ce732811ae5a9f0212561cd2` 的 115/32/8 收据只是早期基线，不代表之后的分支接续或本轮键盘修复；当前工程证据以第 3 节及 GitHub 当前 CI 为准。
