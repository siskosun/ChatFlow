# ChatFlow 0.1 开发计划

**计划状态：** 迁移、核心工程与合成验收已完成；真实账号和真人 UX 门禁仍未完成。  
**制定日期：** 2026-11-02  
**目标仓库：** https://github.com/siskosun/ChatFlow  
**目标版本：** `0.1`  
**唯一正式计划：** 本文件。实施状态、依赖和验收证据均以本文件为准。

## 1. 产品定义

ChatFlow 的目标架构独立于模型供应商；0.1 仅提供 ChatGPT 生产适配器，其他平台明确不支持。0.1 先解决一个清晰闭环：

1. 保存用户明确选择的 ChatGPT 对话、可访问分支和实际附件字节。
2. 在本地档案中查找、阅读、校验、导出和恢复。
3. 将历史材料与用户选择的原始文件带入一个新的普通 ChatGPT 对话，继续工作。

ChatFlow 不建设第二套研究管理系统。正式研究课题、结论、证据和版本管理继续由用户已有的 GitHub 研究仓库承担。0.1 不做通用 Agent 平台，也不做跨应用后台监控。

## 2. 0.7.2 候选基线与来源

本项目从以下准确候选迁移，不从旧 ThreadLine 主干或上游最新版重新搭建：

- 源仓库：`siskosun/threadline-chatgpt-export`
- 候选分支：`threadline/archive-handoff-cloud`
- 0.7.2 代码验收 SHA：`22999dec5f657e6ba4560f5e589382877afeddad`
- 当前候选分支 HEAD（含后续文档更新）：`0eb97b8609170a2bc1964461dd64632ae895877e`
- 来源 PR：`https://github.com/siskosun/threadline-chatgpt-export/pull/2`，保持原状，不合并、不关闭、不改写。
- 上游采集/渲染基座：ChatGPT Markdown Export v0.6.59，固定提交 `13568bf75688de74a5af563b20d5ccd28f4ad532`，MIT。
- 接续交互参考：MoveChat v1.2.1，固定提交 `c4fdb698c09c8be4fbe572ab8a7420bd1e0deb0f`，MIT；只参考安全的新聊天与文件注入，不移植自动发送路径。

0.7.2 已有工程证据：Node 41/41、Chromium MV3 合成 E2E 21/21、IndexedDB 边界 7/7，Ubuntu/Windows 构建通过。其裁定仍为 **合成环境通过、真实账号验收待完成、真人 UX 验收待完成、未合并、未发布**。这些历史结果只作为迁移基线，ChatFlow 必须在自己的准确提交上重新运行测试。

## 3. 0.1 产品范围

### 0.1 必须包含

- 当前选定 ChatGPT 对话的只读采集。
- 可访问分支、消息身份、可见正文和附件引用保留。
- 两种文件范围：
  - 保存对话中的所有文件（默认）。
  - 仅保存当前活动分支最后一份可确认的助手生成文件。
- 来源不明、无法映射、过期、缺失、损坏和按范围跳过必须分别记录。
- IndexedDB 保存元数据及真实 Blob/分块；SHA-256 校验；ZIP/ZIP64 导出与严格恢复。
- 用户明确开启的单对话实时缓存；停止、切换页面或后台重启后不得静默恢复。
- 本地档案列表、搜索、详情、文件选择和恢复。
- 生成接续包：历史文件、索引、短提示和用户选定的原始附件。
- 仅向空白普通 ChatGPT 新聊天预填并注入文件；上传未知时停止并交还控制权。
- 用户手动检查、手动发送。保存、ZIP 下载、文件上传、用户发送分别显示状态。

### 0.1 明确不做

- 不删除、归档、移动或修改 ChatGPT 源对话和项目。
- 不自动点击 Send，不自动重发，不覆盖用户草稿。
- 不读取未被用户明确选定的对话，不做全局后台监控。
- 不建设第二套研究课题/结论/证据管理系统；正式研究资产仍以 GitHub 研究仓库为准。
- 不建设长期自动记忆、全局后台监控或通用 Agent。
- 不在 0.1 中宣称支持尚未完成真实验收的 Claude/Gemini 等平台；先实现可测试的 Provider Adapter 接口，ChatGPT 是 0.1 唯一生产适配器。
- 不在公开 GitHub 提交真实对话、附件、截图、Cookie、Token、签名 URL 或内部研究内容。

0.1 同时纳入前期研究确定的 Context Builder 与受控并行会话能力；它们是归档/接续可靠后的上层能力，不改变默认单会话主流程。

## 3.1 前期研究确定的五层能力与复用边界

0.1 按以下依赖关系完成，而不是把所有功能堆进一个侧栏：

| 能力层 | 作用 | 实现方式 | 优先级 |
|---|---|---|---|
| Archive Engine | 保存、校验、检索、恢复原始对话与文件 | 复用 ChatGPT Markdown Export 的只读采集、渲染、ZIP/ZIP64、原始 JSON、manifest、哈希与附件解析；ChatFlow 维护本地事务和完整性层 | P0 |
| Context Builder | 从多个档案中挑选与当前任务有关的材料，生成可追溯上下文包 | 自研确定性编译器：按来源/消息/分支筛选、去重、预算、分段、索引和来源回链；不把摘要伪装成原文 | P2 |
| Session Execution Engine | 在多个独立会话中执行同一冻结任务并比较结果 | 复用旧 ThreadLine Fork 的 K=2–4、冻结输入、人工发送、盲测/揭盲/裁决流程；复用 Panelize `modules/panel-action-results.js` 的 requestId、provider/window 绑定、ACK、超时和失败分类；参考 Chat On Steroids 的会话归属、完成检测和恢复设计 | P3 |
| Unified Archive Format | 让档案、上下文包和执行结果可独立校验与迁移 | 自研公开 schema：稳定 ID、来源引用、分支图、资产哈希、状态、版本迁移和导入冲突策略；不依赖 UI 内部对象 | P0 |
| Provider Adapter | 把 ChatGPT 页面协议与通用档案/执行逻辑隔离 | 复用 MoveChat 的页面身份检查、DOM 解析、File/DataTransfer 注入模式和适配器边界；ChatGPT adapter 为 0.1 唯一真实适配器，其他平台仅留接口与合成契约 | P4 |

### 复用纪律

- ChatGPT Markdown Export 是采集/渲染/归档基座，不复制其历史批量删除、自动删除或源对话变更功能。
- MoveChat 只复用安全接续模式；明确排除 autoSend、点击 Send 和空文件回退。
- 旧 Fork 的业务流程可复用，但不能把旧版课题状态机或未通过真人验收的行为整体搬回。
- Panelize 仅借鉴异步动作回执与失败处理，不引入不必要的外部运行时依赖。
- Context Builder 与 Unified Archive Format 没有完整成熟组件可直接满足约束，采用小型自研；不为“可扩展”提前建设通用工作流平台。

### Context Builder 的完成标准

- 用户能从本地档案中显式选择来源对话、分支、消息范围和文件；默认不跨档案自动抓取。
- 输出包含 context manifest、来源 conversation/message/node ID、原始档案版本、文件 SHA-256、纳入/排除理由和分段索引。
- 预算不足时按明确规则分段或提示用户缩小范围；不得静默截断。
- 原文、规则提要和 AI 生成摘要必须分类型标记；每个摘要结论可回到原始消息。
- 同一输入快照与配置应产生可复算的内容哈希；输入改变后旧接续包失效并要求重新生成。

### 并行会话引擎的完成标准

- 用户可选择 K=2–4 个独立普通新聊天；先冻结任务指令、上下文包、附件清单与 SHA-256，再打开会话。
- 每个会话绑定独立 provider、window/tab、conversation/document、request ID；迟到回执不能串线或覆盖新任务。
- 只预填，不自动发送；用户逐个检查并手动发送。未确认发送状态保持 unknown，不自动重发。
- 会话完成、超时、失败、取消和未知分开记录；刷新/浏览器重启后可恢复状态，不重放不确定操作。
- 盲测结果在裁决前隐藏分支映射；揭盲、人工裁决和最终报告有独立记录。
- 单会话归档/接续是默认路径；并行实验是显式高级任务，不增加普通用户首屏复杂度。

## 4. UX 目标：Uber 乘客端式任务交互

用户不需要先理解产品模块。打开后应立即知道当前任务、唯一主操作和下一步。

主界面只保留三个清楚入口/页面：

1. **保存对话**：选择来源 → 选择文件范围 → 保存。
2. **我的档案**：选择档案 → 查看完整性与文件 → 继续这段对话。
3. **继续这段对话**：填写可选目标 → 选择文件 → 准备新对话 → 打开新聊天。

界面规则：

- 每个页面只突出一个主操作；完成后主操作切换为下一步。
- 默认只显示完成当前任务所需的信息；媒体权限、实时缓存、配额、批次、提示词和诊断放入“更多设置”或折叠区。
- 不堆叠卡片、标签、状态徽章和小按钮；触控目标至少 44px。
- 使用简洁蓝灰视觉、清楚层级、足够留白；320/360px 手机宽度和桌面宽度均可用。
- 错误和部分成功持续可见；保留用户选择与草稿。
- 不能为了界面简洁而隐藏文件缺失、来源未知、上传未知或部分完成等关键状态。
- 任何截图或合成测试都不能代替真人任务验收。

## 5. 技术与安全不变量

- Chrome/Edge Manifest V3 纯浏览器扩展；无云端后端、无本地常驻服务、无本地 HTTP 服务。
- 大文件在 IndexedDB 以 Blob/分块保存；`chrome.storage.local` 只保存小型设置。
- 只有实际非零字节通过声明大小（若可用）和 SHA-256 校验，才能标记为已保存。
- ZIP 恢复验证 schema、路径、条目、大小、哈希、消息/节点关系和保存范围；拒绝歧义、截断、重复 key、伪造状态和路径穿越。
- 采集、实时缓存和接续绑定明确的 tab、conversation、document、run/handoff ID；身份变化即停止。
- 目标必须是空白普通新聊天；Project、Temporary、旧对话、已有草稿、已有文件或未知页面均拒绝自动注入。
- 不把“派发注入”“出现文件 chip”“上传完成”“用户已发送”混成一个成功状态。
- 上传状态未知时不自动重试、不发送；向用户交还控制权。
- 不声明 `<all_urls>`；外域文件下载使用最小权限，不携带 ChatGPT Cookie、Authorization 或 Referer，并校验 HTTPS 主机及重定向。
- 日志只保留脱敏诊断，不记录正文、文件内容、Token、Cookie 或签名 URL。

## 6. 分阶段开发与验收

| ID | 阶段 | 交付 | 状态 | 依赖 | 完成标准 |
|---|---|---|---|---|---|
| CF-PLAN | 计划与基线冻结 | 本计划、候选 SHA、产品范围、UX 与安全不变量 | done | - | 计划写入 ChatFlow；来源和范围可追溯 |
| CF-01 | 0.7.2 迁移与品牌重置 | 将准确候选代码迁入本仓库；品牌、manifest、构建产物、文档统一改为 ChatFlow；版本改为 0.1；保留许可 | done | CF-PLAN | 文件清单/来源可追溯；旧仓库不变 |
| CF-02 | 新仓库工程基线 | ChatFlow 自有 CI、构建、Node/Chromium/IndexedDB 测试、候选 ZIP、BUILD_INFO 与 SHA256SUMS | done | CF-01 | ChatFlow 准确 HEAD 的 Ubuntu/Windows CI 全通过；包内版本、源码 SHA 和哈希一致 |
| CF-03 | 归档引擎安全复核 | 采集、分支、文件范围、真实字节、实时缓存、ZIP 恢复、草稿保护、目标页白名单、上传状态 | done | CF-02 | 87 项 Node 回归、安全测试及 Chromium/IndexedDB 合成验收通过；未知/缺失/排除状态保持分离 |
| CF-04 | 统一档案协议 | 冻结可移植 schema、manifest、消息/分支/资产引用、版本迁移和冲突规则 | done | CF-03 | ChatFlow archive/1 与 ThreadLine archive/1 导入、往返、哈希/路径/资产关系校验和损坏拒绝测试通过 |
| CF-05 | Context Builder | 来源选择、消息/分支筛选、预算、分段、索引、可追溯 context manifest | done | CF-04 | 多档案来源、分支筛选、关键词、预算分段、附件哈希、重复消息去重、相同附件字节按哈希去重及冲突版本保留均有测试 |
| CF-06 | 受控并行会话引擎 | K=2–4 冻结输入、独立新聊天、人工发送、回执/超时/失败分类、盲测/揭盲/裁决 | done | CF-05 | K=2/3/4 合成端到端均验证相同预填、人工发送、采集和盲测；未知状态不重放 |
| CF-07 | Provider Adapter 边界 | ChatGPT 适配器与通用档案/执行层解耦；补齐能力探测和合成契约 | done | CF-03,CF-06 | ChatGPT 适配器完成集成与能力契约测试；未验收的平台返回 unsupported |
| CF-08 | 真实账号验收 | 独立 Edge 配置中的真实 ChatGPT 保存、附件下载、浏览器重启、ZIP 恢复、Context Builder 与并行接续 | blocked | CF-07 | 必须由所有者在已登录的独立 Edge 配置中执行；云端无真实账号凭据和本地浏览器控制权限 |
| CF-09 | Uber 式 UX 验收与迭代 | 保存、找回、编译上下文、并行任务；320/360/480/768/1280px、键盘/焦点/读屏 | in_review | CF-05,CF-06 | 五种视口、键盘焦点、标签和状态播报的自动化验收通过；仍需 5 名独立目标用户及真人读屏测试 |
| CF-10 | 0.1 完整交付 | 最终 README、安装说明、准确提交构建包、哈希、变更记录和验收报告 | planned | CF-08,CF-09 | 准确 SHA 的 CI 全绿；真实账号与真人 UX 门禁完成；版本号为 0.1；无已知阻断缺陷 |

### 验收基线

- 自动化：至少保持 0.7.2 的 Node 41 项、Chromium 21 项、IndexedDB 7 项测试覆盖；新增/修复必须补充测试，不得删除断言或扩大成功定义。
- 构建：Chrome/Edge 包均可解压；manifest、BUILD_INFO、SHA256SUMS 与源码 SHA 一致。
- 真实账号：PDF、XLSX、CSV、图片、助手生成文件；旧文件可访问/过期/未知；12 与 21+ 附件批次；浏览器重启；ZIP 独立恢复；目标草稿/Project/Temporary/旧对话拒绝；新聊天上传与早/中/末历史事实验证。
- UX：至少 5 名未参与开发的目标用户独立完成“保存—找回—接续”；另由熟练用户完成 Context Builder 和 K=2–4 并行任务；记录成功、失败、放弃、人工求助和耗时。真人测试未执行时，不得声称 UX 达标。
- 隐私：真实数据仅在本地验收；公开仓库只保存合成 fixture 和脱敏结果。

## 7. 当前工程验收记录

**最近一次完整 CI 验证的运行时代码提交：** `daa26bed54179c99c55e612bb70ebab649ceba37`  
**GitHub Actions PR run：** [#41392958708](https://github.com/siskosun/ChatFlow/actions/runs/41392958708)  
**PR：** [#1](https://github.com/siskosun/ChatFlow/pull/1)，保持 Draft，未合并、未发布。

该准确提交的 Ubuntu 与 Windows 两套工作流全部通过：

- Node 安全与回归：**89/89**。
- Chromium MV3 合成端到端：**37 项通过**，包含归档/恢复、旧 ThreadLine ZIP 兼容、Context Builder（含跨档案相同附件字节去重）、K=2/3/4 并行完整执行、只读来源请求及关键 UX 流程。
- IndexedDB 浏览器存储边界：工作流通过，覆盖共享文件引用、并发删除、分块中断、损坏文件及接续提交边界。
- Chrome/Edge 候选包：构建、ZIP 完整性、manifest、运行时脚本清单、许可文件和 SHA256SUMS 校验通过。
- UX 自动化：320、360、480、768、1280px 无横向溢出；首页、档案页、接续页和并行实验页有键盘焦点/标签/状态检查。
- 候选包只包含实际运行时脚本，排除未被 manifest 或工作区引用的旧导出器脚本。当前外层候选 artifact 大小约 196,619 字节；不代表运行速度或资源占用改善。

候选 artifact：`chatflow-candidate-daa26bed54179c99c55e612bb70ebab649ceba37`（ID `13118191970`，外层 ZIP 196,848 字节）。该提交的合成证据 artifact 由同一 Actions run 保存。

PR 文档提交 `e1a2270df51fa79905f3b747f1bc1c347c15e819` 不改变运行时代码；该准确 PR HEAD 的 Ubuntu/Windows 全流程亦在 [Actions run #41393277191](https://github.com/siskosun/ChatFlow/actions/runs/41393277191) 通过，候选包 artifact ID 为 `13118277223`。

**尚未完成的外部验收：**

1. 真实 ChatGPT 账号页面协议、旧对话、真实文件来源及下载、附件上传和实际模型读取行为。
2. 至少 5 名未参与开发的目标用户完成保存—找回—接续任务；另需熟练用户执行 Context Builder 和 K=2–4 并行流程。
3. 真人读屏/辅助技术验收。

合成测试不能代替上述门禁。未执行项目继续保持 blocked/in_review，不得标记为通过。## 8. 执行约定

1. 先完成当前阶段，再进入下一阶段；每次只推进一个阶段或一个可独立验收的子任务。
2. 正式开发、提交、构建和自动化测试在 GitHub 云端执行；不访问用户本机、不请求账号凭据。
3. 代码在功能分支提交并通过聚焦 PR；不修改源项目，不将 ChatFlow 代码回写 ThreadLine。
4. 不自动合并、不自动发布、不提交浏览器商店。发布前提供准确 SHA、CI、构建包哈希和未完成事项。
5. PR、CI、合成网页、真实账号和真人 UX 是不同证据等级。不得把其中一类结果冒充另一类。
6. 连续三次复现同一失败后停止盲目重试，定位根因并记录 blocked/unknown。
7. 所有任务状态只能使用 `planned`、`in_progress`、`in_review`、`blocked`、`done`、`deferred`。只有证据满足完成标准时才可改为 `done`。

## 9. PR #1 最新准确 HEAD 验证（2026-11-02）

- PR HEAD：`e70e3b36f63de3e0a35dfaa360bea6291ebfb8ca`（分支 `cf/0.1-migration`）。
- GitHub Actions run [#41393582931](https://github.com/siskosun/ChatFlow/actions/runs/41393582931)：`verify` 与 `windows-baseline` 均 completed / success；该运行对应上述 PR HEAD。
- 本轮验证确认 Node 安全/回归 89/89、Chromium MV3 合成 E2E 37 项通过、IndexedDB 存储边界工作流通过、Chrome/Edge 候选包构建与校验通过。
- 此提交包含后续文档更新；运行时代码的最近完整验收提交仍为 `daa26bed54179c99c55e612bb70ebab649ceba37`，PR HEAD 与运行时代码提交不得混称。
- 当前 PR 仍为 Draft/Open、未合并、未发布。CF-08 真实账号验收为 blocked；CF-09 真人用户与读屏验收尚未完成；CF-10 因依赖未闭合保持 planned。
