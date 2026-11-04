# ChatFlow 开发计划与工程验收（0.2 历史证据 / 0.3 工程候选）

**当前状态：0.3 工程候选与侧边栏修订（PR #3/#4）均已于 2026-11-04 合并 main。`167d4593eef4c75a4cd08f362730405171d73312` 对应 GitHub Actions #41788480392 三项任务成功。第 14 节新增可靠性修订范围尚未实施或验收；真实登录、独立用户及辅助技术验收仍待执行。**

目标仓库：`siskosun/ChatFlow`。现行版本：`0.3`。[PR #3](https://github.com/siskosun/ChatFlow/pull/3) 已合并 main，Draft/Open 为历史状态；目前仍无正式 Release。PR #1/#2 是历史候选，不改变后置验收要求。

本文件是正式范围与验收计划；运行状态以 `chatflow-0.3.tsm.json` Checkpoint 为真源。第 1—7 节记录 0.2 的已完成范围、工程证据与历史，不因新增方向而倒改既有验收事实；第 8—12 节规定 2026-11-03 起新增的 0.3 产品范围与待执行门禁。此前计划中以真实账号、五名独立用户或真人读屏作为当前开发前置条件的安排，已由用户明确改为后置验收。工程完成不等于这些测试已经执行，也不等于正式发布获批。

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

## 3. 0.2 历史可复核验收证据

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


---

## 8. 0.3 产品方向调整（2026-11-03，待实施）

### 8.1 两个并列主流程，拒绝功能堆砌

0.3 的首页只强调两个用户任务，权重相同：

1. **保存并接到新对话**：保存当前选定对话、查看档案，带着来源和原始文件安全接续到新的 ChatGPT 普通聊天。旧有 `保存对话 → 我的档案 → 继续这段对话` 是这条主流程内部的步骤，不拆成三个同级产品模块。
2. **任务回传**：从当前 ChatGPT 对话给 Codex / 其他 Agent 派发轻量任务；在任意时点粘贴 Agent 结果；准确找到来源对话并返回，用户自行确认后发送。支持短任务、纯复制粘贴，**不要求 GitHub Issue/PR、Agent API、云服务、后台常驻或事先归档整个对话**。

首页两个等权入口；进入其中一条流程后，每个页面只突出一个主操作和一个清晰下一步。`我的档案` 与 `待回传` 分别归属对应主流程。默认不出现工具箱式十多个按钮、常驻侧栏或大面积浮层。与既有高级能力相关的实现保留，不改变既有来源、文件、身份、校验与安全语义。

产品判断门槛：如果普通用户通过原生 ChatGPT + 少量手工复制已经能够可靠完成任务，且 ChatFlow 没有在误归属或人工补救上带来实测优势，就不为“独立产品”增加其他系统。

### 8.2 默认层和高级功能区

**默认层（开箱可用）**

- 保存并接到新对话：当前对话选择、文件范围（默认所有可取得的文件，保留“仅最后生成文件”这一明确选择）、档案查找、继续。
- 任务回传：`交给 Agent` / `回传结果`、来源对话预览、`返回原对话`。
- 用到长对话时按需打开的轻量搜索/时间轴入口。可关闭且不遮挡 ChatGPT；默认不持续扫描未选定会话。
- 完整性缺失、来源未知、回传匹配冲突、文件未取得、上传状态未知、草稿存在等 **实质风险提示始终可见**，不因简化界面而隐藏。

**高级功能区（默认折叠、按需求显式启用）**

- 多档案 Context Builder、复杂分支选择、完整消息/重点片段/混合模式、高级关键词和分段/预算选项。
- K=2–4 并行对照实验、盲测裁决。
- 实时缓存、导入恢复高级诊断、配额/媒体权限细节、哈希与 ZIP/ZIP64 检查、复杂文件选择。
- 非核心的工具：多格式批量导出、提示词模板管理、公式复制、更多导航偏好。

高级区是交互分层，不得删除现有功能、停用必要校验、放宽权限或使已保存档案不可访问。开关状态保存在小型本地设置中；启用高级功能需要明确用户动作；关闭后仍可查看此前产物并处理错误。高度危险/不可逆的操作仍须单独确认，不因高级开关而自动执行。

## 9. 轻量任务回传（与对话接续并列的主功能）

### 9.1 最短用户流程

1. 在 ChatGPT **对话 A** 点击 `交给 Agent`，直接输入或选中一小段任务。ChatFlow 在本地登记来源，并复制附带短任务标记的正文，例如 `[CF-7K2M9Q4D]`；普通复制粘贴即可发送给 Codex、Claude 或其他 Agent。若浏览器拒绝写剪贴板，提供可手动全选的文本，不虚报已复制。
2. Agent 回答时尽量原样保留该标记。用户点击 `回传结果` 并粘贴内容，不要求 Agent 安装扩展、不要求联网调用、不要求 Issue/PR。
3. ChatFlow 只用**精确任务标记**关联本地任务记录；在回传预览中显示来源对话、任务摘要和是否匹配。用户点击 `返回原对话` 后打开准确来源；默认只复制准备好的结果，用户手动粘贴/发送。
4. **无标记或标记丢失**：显示最近未回传任务，用户显式选择来源后可继续，记录为 `manual_assigned`，**绝不以相似主题或标题推断成精确匹配**。标记冲突、未知任务或多重命中返回阻断提示，用户手工处理。

### 9.2 数据、身份及失败边界

- 每次派发创建唯一随机 `taskId`（带碰撞检查，显示短标记）；必要时 `attemptId`/`resultId` 区分同一任务的多次执行及多次回传。不能以主题、标题、时间接近、浏览器标签 ID 或 Agent 名称充当唯一键。
- **来源身份**记录为：规范化 ChatGPT `origin`、`conversationId`、可回到的原始 URL、创建时间、任务摘要/内容哈希；当来源消息/分支 ID 确实可取时一并记录；未知则显式 `unavailable`，不得伪造。`tabId` 仅作为即时会话提示，不是持久身份。
- 独立本地 `tasks`/`taskResults` 存储，版本化 schema、无损迁移、导出/恢复兼容性和删除边界。最小任务不依赖原对话已完整采集；不存储 Cookie、Token、签名 URL。已有归档可选关联 `captureId`，不是必填。
- **任务来源**与**结果后续被分享/引用的目标对话**分开记录。用户可以将结果另行用于 B，但不得修改 A 的原始派发来源。
- 默认 `回到原对话 + 复制结果`。**禁止将既有 `tl-inject` 的“仅限空白新聊天”接续规则直接挪用到旧聊天。** 未来如实现向旧聊天预填，必须先单独设计并实测空草稿、来源身份和用户主动触发门禁；绝不自动点击发送、覆盖已有草稿、操作未知上传或在冲突时猜测来源。
- 任务数据仅本地处理；不监听全局剪贴板，不自动读取其他 Agent 的聊天记录，不跨站抓取结果；不增加 `<all_urls>` 权限。用户换浏览器/配置文件时，只有显式导出导入的任务索引才能恢复关联，不假装自动云同步。
- `GitHub Issue/PR` 只作为高级可选关联字段，绝不构成轻量任务必经路径。

### 9.3 必须通过的合成场景

两个**同主题、同标题、甚至相同任务文字**的 ChatGPT 对话同时派发任务，两个标记乱序返回时准确分别归属；同任务多 Agent 重试分别留存结果；浏览器重启后关联稳定；没有来源对话全文档案也可派发；缺失/伪造/重复/冲突标记、已关闭来源、浏览器跨配置文件、草稿非空、结果剪贴板失败、附件未知均得到明确且安全的状态；测试不使用真实对话数据。测试“打开来源 URL”不等于“ChatGPT 已接受回传”或“用户已发送”。

## 10. 小功能的直接移植与去重

仅引入能明显减少日常操作成本、许可证可复核、工程成本可控的功能。**优先复用现有 MIT 源代码，按 ChatFlow 源身份和 UI 约束进行局部适配；不整仓复制，不重复已有归档、重点片段或 ZIP 机制。**

| 优先级 | 候选功能 | 候选代码/参照 | 迁移决策与边界 |
|---|---|---|---|
| P0 | 当前长对话“关键词搜索、上/下一处命中” | [Toolkit search.js](https://github.com/bujue3709/GPT-Conversation-Toolkit/blob/main/features/search.js)、conversation-index.js | 复用搜索索引思想及适配代码；仅当前用户主动打开的会话，不后台遍历；API 不可用时标明覆盖范围不足。 |
| P0 | 轻量提问时间轴、悬停预览、点击定位 | [Toolkit timeline.js](https://github.com/bujue3709/GPT-Conversation-Toolkit/blob/main/features/timeline.js)、virtualized-jump.js | 默认只显示一个极轻入口，用户开启才出现时间轴；复杂虚拟化跳转用消息 ID+确认，失败不能误跳到近似文本。 |
| P1 | 指定问答回合导出 Markdown/JSON/TXT | [Toolkit export-selection.js](https://github.com/bujue3709/GPT-Conversation-Toolkit/blob/main/features/export-selection.js)、export-formatters.js | 复用纯格式化函数/回合选择 UI，保留 ChatFlow 分支和引用身份；不能把筛选文件误标为完整档案。 |
| P1 | 公式 LaTeX 一键复制、轻量选段复制/引用 | [Toolkit latex-copy.js](https://github.com/bujue3709/GPT-Conversation-Toolkit/blob/main/features/latex-copy.js) | 用户触发才加载，不能改变宿主页面公式、原文或剪贴板而不告知。若原生已等效提供则不重复实施。 |
| 不引入 | 旧版长会话 DOM 折叠、另建侧栏文件夹、常驻复杂工具栏 | Toolkit 旧功能/ChatLine 设计 | 可能与 ChatGPT 虚拟化列表及 ChatFlow 核心流程冲突；不是默认产品范围。 |

源码移植前固定上游提交和许可证，记录来源、适配差异、第三方声明与安全测试。Toolkit 是 MIT；[ChatLine](https://github.com/miguchn/ai-chatline) 为 GPL-3.0，仅参考交互，不直接混入当前 MIT 工程；[Bonjourr](https://github.com/victrme/Bonjourr) 亦仅参考视觉/交互，不复制 GPL 风格资源。对网页 DOM/API 适配应做失效检测、独立测试和 ChatGPT 更新后的降级处理；禁止靠提高扩展权限换取“正常运行”。

## 11. 社区认可的界面参考与 ChatFlow 设计原则

2026-11-03 的公开来源调研，**采用实际界面/使用方式 + 商店规模/评论作为弱社区信号**。安装量与评分不等于特定 UI 设计已经经过严格可用性测试，也不代表已对所有版本做实机验证。

| 参考 | 公开信号及来源 | 借鉴点 | 明确不照搬 |
|---|---|---|---|
| **Bonjourr**（美观简洁） | [Chrome Web Store](https://chromewebstore.google.com/detail/dlnejlppicbjfcfcedcflplfjajinajd) 显示约 4.9/5、约 2.4 万评价；[官方文档](https://bonjourr.fr/docs/overview/) | 默认画面清爽、充足留白、少数主要动作；复杂定制在设置中按需展开，视觉层级轻。 | 新标签页的大幅照片、天气、时钟、玻璃背景效果与 ChatFlow 工作流程无关，不移植。 |
| **Dark Reader**（单主开关） | [Chrome Web Store](https://chromewebstore.google.com/detail/eimadpbcbfnmbkopoojfekhnkhdbieeh) 为数百万用户级扩展；[官方帮助](https://darkreader.org/help/en/) 说明顶部主开关及后续高级参数。评分抓取来源/时点有差异，不以单个数字推断 UI 优越。 | 主开关可见，网站/任务范围明确；高级选项在后层；局部失败状态一眼可知。 | 将大量主题调节、全站开关照搬为 ChatFlow 复杂设置面板。 |
| **Raindrop.io**（一次操作的简洁弹窗） | [Chrome Web Store](https://chromewebstore.google.com/detail/ldgfbffkinooeloadekpmfoklnobpien) 约 50 万使用者、评价约 4.2；[官方扩展文档与截图](https://help.raindrop.io/browser-extension) | 预填来源标题与信息、只让用户补少量字段、一个明确保存按钮；适合任务派发/回传预览。 | 书签分类、标签、完整收藏管理；公开页面仅作为 UI 参考，不主张有代码移植授权。 |
| **ChatGPT Conversation Toolkit**（功能结构样本） | [源码与 README](https://github.com/bujue3709/GPT-Conversation-Toolkit)，可核实时间轴、搜索和导出；MIT | 可复用小功能和 ChatGPT 虚拟列表的定位策略。 | 工具栏、文件夹、完整 Prompt 库整套 UI；项目功能丰富不等于普遍公认其视觉设计。 |

**最终界面规范：**

- 首页仅两项：`保存并接到新对话`、`任务回传`；各子流程只允许一个明显的当前主操作。状态变化时原按钮自然转成下一步，不堆叠操作卡片。
- 任务回传界面先显示 **来源对话 + 精确/人工匹配状态**，再显示 `返回原对话`；任务号主要用于机器匹配，不要求用户记忆或输入。无匹配不显示“已确定来源”。
- 轻量导航不改变 ChatGPT 原生侧栏，不抢滚动、不遮挡输入框；用户不用时完全收起。与浏览器浅/深色主题保持一致，避免模拟其他插件的外观素材。
- 统一文字、间距和触控尺寸（目标至少 44px），按 320/360/480/768/1280px 验收；键盘焦点、读屏命名、错误可恢复和对比度均单独测试。
- 高级区用“按需展开”的原生面板；不以复杂动画、密集徽章、技术日志或长表单取代一步可完成的操作。出现 `文件未保存`、`来源冲突`、`回传未发送` 时必须清楚告知，不因为美观隐藏风险。

## 12. 0.3 实施顺序、门禁与历史保护

| ID | 交付阶段 | 状态 | 可验收条件 |
|---|---|---|---|
| CF-17 | UI 参考与代码复用清单冻结 | implemented；验证见 Checkpoint | 核对上游许可证/固定提交，确认 P0/P1 小功能、许可声明、UI 参考截图与排除项；没有泛化“社区公认”断言。 |
| CF-18 | 双主流程和高级功能区交互重排 | implemented；验证见 Checkpoint | 默认首页两项主任务、逐页唯一主操作；高级选项默认折叠/关闭但原功能可达；无安全状态隐藏；320—1280px 自动化验收。 |
| CF-19 | Task Loop 本地身份和任务派发 | implemented；验证见 Checkpoint | 不存档全文也可从当前对话生成任务标记+文本；本地唯一任务 ID；零 GitHub/云端/API 依赖；剪贴板失败可恢复；来源身份明确。 |
| CF-20 | Task Loop 结果回收和返回来源 | implemented；验证见 Checkpoint | 粘贴结果精确匹配；无/冲突标记要求人工确认；同主题双对话及多轮重试不串线；打开来源+复制文本，无自动发送或覆盖草稿。 |
| CF-21 | 长对话导航及小工具按许可移植 | implemented；验证见 Checkpoint | 搜索/时间轴在虚拟化列表上定位有证据，失败不误跳；选定回合导出保留来源；仅必要脚本按需加载。 |
| CF-22 | 产品化回归和独立工程候选 | implemented；验证见 Checkpoint | Node/Chromium/IndexedDB、权限、schema 迁移、ZIP 兼容、安全负向场景、CI 双平台构建均通过；历史 0.2 用例和断言不删不放宽；按准确 HEAD 出报告。 |
| CF-23 | 后置真实账号及独立用户验收 | deferred | 真实登录 ChatGPT/Edge、不同 Agent 手动往返、同主题多任务、真实附件、至少五名独立用户任务完成率与读屏验收；未执行不得说已通过。 |

**开发纪律：** 阶段 CF-17—CF-22 可在已授权的 GitHub 工程环境自主推进；CF-23 延后至工程阶段完成。先对现有 0.2 已通过功能做最小界面重排与任务回传，不为新版功能重新发明归档/任务管理。0.2 既有验收提交及测试计数继续作为历史事实，不伪称 0.3 新功能已经实施或通过。0.3 的候选代码在独立功能分支和聚焦 PR 中完成；本次文档更新不自动合并 PR #1/#2，不自动发布。若真实测试表明日常任务靠手动带标记复制已足够，则不扩展成更复杂的 Agent 调度平台。

## 13. 0.3 可靠性修订及本轮验收范围

用户要求的顺序为：先来源锁定、可恢复归档和任务备份容量，再输入完整性、版本文档、暗色与主操作，随后大库性能与回归，最后真实登录和真人验收。各项已落入实现；未通过准确提交的工程门禁前不标记为验收通过。

- **来源锁定：** 普通保存冻结 tab、conversation、document，所有异步步骤保持绑定；停止后等待已接收写入收敛，避免完成状态被晚到写入覆盖。
- **可恢复归档：** archive/2 将大附件拆成不超过 64 MiB 的 ZIP 条目，总展开量仍限 256 MiB；导出前检查源字节，导出后运行真实恢复解析器。下载/实时采集期间禁止导出。65 MiB 往返与停止后的不完整归档由实际 IndexedDB 测试验证。
- **任务备份：** v2 JSONL 按记录读写，去掉新格式的整库 4 MiB 门槛；1000 任务/2000 结果数量上限不变，导入先完整校验再单事务合并。旧 JSON v1 备份仍兼容。
- **输入与交互：** 采用 [stageshow 原型](prototypes/chatflow-0.3/README.md)；完成后主操作进入新对话，重新采集和备份为次操作。超限粘贴保留全文、明确报错并阻止提交；暗色共用主题变量。
- **性能：** 一次编译内懒计算并复用快照哈希，宽分支用集合校验。v4 摘要索引支持档案/任务/结果分页。预算、固定样本与解释见 [PERFORMANCE.md](PERFORMANCE.md)。
- **验证：** CI 在安装的 Chromium MV3、真实 IndexedDB 和合成来源页上检查上述行为；真实剪贴板按键事件与 UI 对比度单独报告。此处“真实”仅修饰浏览器/API，不代表真实账号、真实用户库或真人可用性已经通过。

本轮延续 CF-23 后置门禁。工程候选通过后，再按 `REAL_ACCOUNT_ACCEPTANCE.md` 执行获授权的账号与真人测试；没有参与者或可用环境时如实保留待验收状态。


---

## 14. 2026-11-04 可靠性优先修订方案（待工程实施）

### 14.1 目标与基线

代码基线为 `167d4593eef4c75a4cd08f362730405171d73312`；Actions `41788480392` 的 `verify`、`windows-baseline`、`reproducible-build` 已成功，仅证明该提交原有测试通过。此修订基于该 SHA 的源码反例，不声称真实 ChatGPT 登录测试已执行。

本轮路线仍为 `REUSE CODE + BUILD`。不更换架构，不重做源对话 API 采集、Blob+SHA-256、archive/2 ZIP 恢复、IndexedDB v4、Task Loop、原生侧边栏，不增加 `<all_urls>`、云端后端、自动发送、自动重试和无证据成功判定。

**首要目标：错误来源归属、错误跳转成功、错误附件就绪在固定负向测试中均为零，同时保留正向操作能力。** 对于缺乏身份证据的页面内容，可以提供明确标注的“仅本次页面观察”状态，但不得提升为已验证的 API 消息或附件。

### 14.2 可靠性门禁：先改再扩展

| 门禁 | 已发现的源代码风险 | 预期行为 |
| --- | --- | --- |
| DOM 来源范围 | `tl-tools-page.js` 在全 `document` 搜索节点；SPA 可能保留隐藏旧对话容器 | 对每个页面读取入口限定当前会话的活动容器；存在冲突/多个候选则拒绝归属。API 来源锁继续独立运行，不因 DOM 无身份证据而阻断可信 API 保存。 |
| 附件确认 | `tl-inject.js` 的 `uploadsConfirmed()` 使用 `text.includes(name)`，例如 `old-report.pdf` 可假阳性确认 `report.pdf` | 只在目标编辑器关联的附件区域检查明确、唯一、完整的文件名和就绪标识；截断/无名/同名歧义保持 unknown；页面显示就绪不等于服务端接收、模型读取或用户发送。 |
| 同名文件漏报 | `tl-capture.js` DOM 可见附件按全对话小写文件名去重 | 依据活动对话 ID、消息 ID/节点 ID、可用文件引用及同消息出现次数对账；两条消息同名不共享身份。缺少身份证据时记录未确认覆盖范围，不静默去重或虚构字节。 |
| 无 ID 导航 | `tl-tools-page.js` 可直接返回仍连接的未知 ID DOM 节点，界面却称“消息身份匹配” | 区分 `verified_message_id` 与 `observed_dom_node`；后者只可描述为页面观察，不得宣称原消息身份已确认。来源变化、容器替换或消息失效则取消。 |
| 辅助页面读取 | 公式选择和 Task Loop 的在线选文可能不经相同 DOM 范围检查 | 将选文、公式、消息列表、滚动、DOM 附件对账纳入同一来源守卫。无法核验时不归属，不从隐藏旧对话读取。 |
| JSON 解析资源 | `tl-capture.js` 在 `response.json()` 后才检查模型上限 | 使用有界流读取，解析前验证声明和实际字节；会话响应初始上限 32 MiB、会话凭据 1 MiB、文件元信息 2 MiB；超过上限立即取消、返回可读错误、不保留半成品。上限应满足当前已有合成正常样本，确需修改需新增性能证据，不得静默扩大。 |

页面范围模块建议为只读 `src/tl-page-scope.js`。其确认等级必须含 `confirmed`、`unverified`、`ambiguous`、`unavailable`，明确区分页面可见性、来源身份、消息身份与 API 返回身份。禁止把“仅一个可见容器”、文件名相同、文本前缀或消息序号提升成强来源身份。保护 A→B→A 快速 SPA 切换、异步迟到回执、容器重挂载和取消后的后台滚动。

### 14.3 实施顺序（功能分支与聚焦 PR）

| 批次 | 内容与核心文件 | 验收与结束条件 |
| --- | --- | --- |
| **PR-A：可靠性** | `src/tl-page-scope.js`、`tl-tools-page.js`、`tl-capture.js`、`tl-inject.js`、`tl-task-service.js`；按需更新 `manifest.json`、`build.py`；新增合成负向测试 | DOM 身份冲突不误归属；同名不同消息不漏报；子串或截断文件名不误确认；无 ID 定位只报观察结果；API 大响应先拒绝后解析；正向采集、接续、任务回传保持可用。 |
| **PR-B：消息级导航** | 优先修复既有 `jump()`；必要时小范围复用 ChatTrail `chatgpt-initial-jump-utils.js` 的纯计算函数和 MIT 许可；AI Chat TOC 仅参考反向逻辑滚动轴 | 已挂载与虚拟化消息的精确身份确认；用户滚动、触摸、键盘、切换对话立即取消；任务上限与超时明确；不得以文本前缀、序号或估算位置报告成功。 |
| **PR-C：备份状态报告** | `workspace/app.js` 与现有 `tl-core.js`/`tl-archive.js` 的结果展示；只需兼容字段，不新建 ZIP/数据库 | 分别显示本地保存过程（保存中/完成/部分/取消/中断/失败）、备份（未生成/该版校验通过/失败）、实际导入恢复（未执行/已验证）。每项结果绑定具体快照、文件哈希及版本；“导出时恢复解析通过”不能显示“实际已导入”。 |
| **PR-D：逐文件接续状态与 UI** | `tl-inject.js`、`tl-service.js`、`workspace/app.js`，扩展兼容字段，不改变旧记录的历史语义 | 已准备字节/已交给页面/网页显示就绪/未知/人工核对逐文件可见；旧 `upload_confirmed` 不被升级为模型已读取；无自动发送/静默重试。 |
| **独立增量：回答内部章节目录** | 在 PR-B 通过后另建 PR，借鉴 LunaTOC 标题提取；不与导航安全重构混合 | H1–H6，忽略代码围栏伪标题，消息 ID 与标题 ID 双重归属，同名标题消歧；找不到章节只报告消息定位；无第二套常驻导航栏。 |

来源隔离、附件误确认及响应上限是 **PR-A 共同门禁**，不因逐文件 UI 放在 PR-D 而延后。已有重点片段和任务回传不引入第二套书签、任务或附件库。

### 14.4 预先固定的测试与预算

- **错误成功率：零容忍。** 固定合成反例中的跨对话归属、同名附件漏报、文件子串误确认、无身份定位强成功、取消后继续滚动都不得出现；“未知/失败”必须保持其含义，不以跳过全部操作来通过。
- **正常成功率：** 固定的有证据、可达样本应全部通过基本采集/接续；导航在可挂载、有稳定 ID 的正向集合中目标成功率至少 95%，其余必须能明确超时/取消，不得误报。不可达与缺失 ID 集合独立计数，不能混入成功率分母。
- **导航预算：** 已挂载目标不超过 2 秒；虚拟化远距离跳转总墙钟不超过 12 秒、至多 60 次有界滚动步进；超过后明确失败并清理事件监听、临时样式及状态。取消必须使后续异步结果失效。预算仅在指定合成 Chromium 样本及 CI 机器上判定，不作为真实页面速度承诺。
- **资源预算：** 解析前会话 API 响应 32 MiB、会话信息 1 MiB、文件下载元信息 2 MiB；保留现有 16 MiB 规范化快照限制、65 MiB 分块回归、64 MiB ZIP 条目及 256 MiB 总展开限制。边界值、超限 1 字节、早期 Content-Length、流式超限、取消和异常响应都测试。
- **固定场景：** 264 与千级消息；正常/反向滚动；A→B→A 快速切换；同时挂载隐藏旧节点、无 ID 与双 ID 冲突；两条消息的 `report.pdf`；`report.pdf` 与 `old-report.pdf`；截断文件名、迟到回执；相同标题与重复正文；用户干预及目标容器替换。
- **回归纪律：** 不删除已有断言、不改宽 success 条件；Node + 安装真实 MV3 的 Chromium 合成用例、真实 IndexedDB、键盘/窄屏及 Ubuntu/Windows 可复现构建按准确 SHA 验收。真实登录 ChatGPT、真实附件、独立用户与真人辅助技术仍是后置验收，不冒充合成通过。

### 14.5 证据与状态管理

`chatflow-0.3.tsm.json` 现有 `pass` 只代表先前较窄范围的测试，不证明上述新增门禁。按 Checkpoint 规则使用 `scripts/tsm.py` 维护新功能和验证节点；不直接修改 JSON 状态文件或伪造 `pass`。各 PR 在评论中列准确 HEAD、代码差异、失败/成功测试和 CI 链接。PR-A 未验证前，不得把 PR-B 的功能截图视为可靠性证明。

所有上游源码复用固定许可与 SHA，更新 `THIRD_PARTY_NOTICES.md`；仅纯计算算法允许适配，禁止复制 AI Chat TOC 模糊文本匹配、凭据提取及完整注入器。仓库 `AGENTS.md` 禁止直推 main、自动合并、正式 Release、商店上架和用户本机 Remote 操作。


## 15. Rollout implementation amendment

The fixed A baseline is `dc30f51652e459a417401288a42d64026419565d` with successful
GitHub run `41812175880`. The subsequent implementation preserves archive/2 and task
backup formats, but uses **IndexedDB v5** to repair missing indexes on already-v4
databases. A v4-only repair would never run for those existing databases. This is an
explicit exception to the earlier keep-v4 preference, with no data deletion or new
business store. The upgrade/backward-format contracts are tested separately.

B-D and engineering review fixes retain the two main workflows. E answer headings
remain an independently testable optional increment. Runtime permissions, no-autosend,
no-unknown-upload-retry and no main/release writes remain unchanged. Checkpoint owns
execution status; see REVIEW_DISPOSITION_2026-11-04.md for review scope and limitations.
