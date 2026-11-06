# ChatFlow 第二轮开源实现审阅与吸收

日期：2026-11-05（北京时间）  
比较基线：`97c0e345f25559afe6158fa46498568fcde8196c`（已合并 PR #32、#33）  
范围：对话导航与搜索、选文操作、摘录与分支、归档导出、附件接续、任务往返、并行比较。

## 结论

本轮继续沿用浏览器原生侧边栏和现有档案、任务底座。值得吸收的是几个具体机制：短时观察延迟出现的选文菜单；按真实尺寸放置操作按钮；在导出时保留明确对应的引用来源；让同名附件与原消息及实际上传名一一对应；按窗口和请求标记隔离异步任务。

“功能更多”不构成替换理由。某些候选会自动发送、覆盖已有输入、把文件名相似视作上传成功，或对整页进行模糊摘录定位。ChatFlow 已有的来源身份、实际文件字节、精确匹配和明确失败处理应保留。没有引入第二个采集器、数据库、UI 框架、模型调用或本机服务。

## 调研方法与证据边界

先核对主线和开放 PR，再读取项目许可证及具体实现文件。README、商店介绍和检索结果只用于发现候选，不作为正确性或可靠性的证明。以下区分源码事实、设计判断和本轮实施。

上游的“完整导出”“无缝恢复”“已测试”等宣传没有被直接采用。尤其注意它们是否只读取已挂载 DOM、是否保留失败和未知状态、是否默认收集所有对话，以及是否把点击、上传、发送与模型读取混为一个成功状态。这里评估的是具体实现和适用性，没有据此推断开发者故意误导。

本轮不依赖星数、安装人数或“社区公认最好”排序。相似项目之间也可能共享同一底座，不能把多个 README 当作独立验证。

## 已读项目与处置

| 项目、固定版本 | 实际读取的主要文件 | 许可核查 | 结论 |
|---|---|---|---|
| [Threadmark](https://github.com/ccheney/threadmark/tree/95962bd3d09d48f6537e83f6cada4b1ca87bfd2f) | `src/features/capture/modules/bubble.ts`、`highlighter.ts`、LICENSE | MIT | 吸收短时观察迟到原生选文菜单；不复制其插入原生 React 工具栏和整页模糊定位 |
| [penciled](https://github.com/marcellosso/penciled/tree/feeb55e144f0a35c867fb2c0dcfd7c950af015d0) | `packages/penciled/src/ui/annotate.ts`、`engine/anchoring/selector.ts`、LICENSE | MIT | 吸收真实尺寸、边界翻转、resize 与关闭生命周期原则；不增加整个依赖 |
| [pionxzh/chatgpt-exporter](https://github.com/pionxzh/chatgpt-exporter/tree/ce5987a328a95945777bcdac6b953855424fac22) | `src/utils/citations.ts`、LICENSE | MIT | 吸收同消息引用元数据到标准链接的映射；保留无法解析的标记 |
| [ContextBridge](https://github.com/vinchlabs/contextbridge/tree/35e23a261683769f2a976055fa91ba9e2ae6ec00) | `src/core/handoff/attachment-plan.ts`、`strategies.ts`、`composer-import.ts`、LICENSE | Apache-2.0 | 吸收附件引用与上传名使用同一映射的设计；本轮独立实现，不复制代码 |
| [Multi-AI Chat](https://github.com/TED-H-com/multi-ai-chat/tree/c93fef795b7209e8a95e7276352149b40417d5de) | `src/shared/providerRequestState.ts`、`src/background/providerTabOwnership.ts`、LICENSE | MIT | 参考异步状态与标签页所有权处理，发现并修复 ChatFlow 多窗口选文归属缺口；不移植自动广播发送 |
| [ChatGPT Markdown Export](https://github.com/thekester/chatgpt-export/tree/13568bf75688de74a5af563b20d5ccd28f4ad532) | 现有锁定版本及 `src/render.js` 引用转换、LICENSE | MIT | 最新提交与现有 pin 相同，没有“升级到新版本”的增量；不采用缺少精确绑定时退回本消息全部来源的逻辑 |
| [MoveChat](https://github.com/VC067/MoveChat/tree/c4fdb698c09c8be4fbe572ab8a7420bd1e0deb0f) | 注入、附件降级、预填和发送路径、LICENSE | MIT | 最新提交与现有 pin 相同；不吸收空文件降级、短前缀验证或自动发送 |
| [Branch of Thought](https://github.com/ijzereen/branch-of-thought/tree/29924d2068fc76bc6b83a73b5d97e960807e1017) | `sidepanel/panel.js`、`src/interceptor.js`、LICENSE | MIT | 当前路径标签、其他分支展开可作为后续展示参考；不替换任务回传底座，不引入常驻 fetch/XHR 拦截 |
| [AI-RELAY](https://github.com/Yaascine/AI-RELAY/tree/11722376b57a875a9d365a3d89edfb167e439a6b) | `PreviewScreen`、`analyzer.ts`、LICENSE | MIT | 可编辑交接预览有参考价值；英文正则、以后续词重叠推定问题解决的摘要器不适合作为中文任务进度事实 |
| [Relay Chat Handoff](https://github.com/vishwajeetchandole/relay-chat-handoff/tree/73c3d5f564d45523ac97954729b327849d0280d8) | `src/lib/handoff.js`、项目许可声明 | README 声称 MIT，未找到相应项目 LICENSE / package license | 仅作交互比较，未复制代码；首条用户文字、最近助手文字和末 400 条裁切不足以证明可靠恢复上下文 |
| [Sidenote](https://github.com/prakashl1998/Sidenote/tree/981db3f89083ffd4ef63ad8d267b1c52c1526f33) | 选文与锚定入口、`package.json`、根目录文件树 | `UNLICENSED`，未找到 LICENSE | 源码可读不等于已获可复用开源许可；没有复制其代码 |
| [AI Chat TOC](https://github.com/harshmann10/AI-Chat-TOC/tree/d76407ceb80b5ff8f104a7ec38752e7a2e5cf0d3) | `src/ui.js` SearchManager、`src/store.js` 滚动范围、LICENSE | MIT | 吸收 Escape 先清空搜索的层级；保留现有精确来源与可取消导航 |
| [ChatGPT Timeline](https://github.com/21888/chatgpt-timeline/tree/7f92a909f7bec34dcf324a75ce690f0ba5c68883) | `extension/content.js` 的 observer、rAF 合并、当前节点与目录跟随、LICENSE | MIT | 当前位置提示可参考；不复制逐节点几何扫描与目录自动跟随，不替换现导航核心 |

上一轮已移植的 ChatTrail / Toolkit 构成本轮比较基线，不计作新增成果。

另筛选 ChatGraph（`Robbings/chatgpt-graph-navigator@a616cefd3fb6764ad25f0d50417fbebe14156660`）：实际检查到 package 声明 MIT，但未找到项目许可证文件；只核对包信息与文件树，未完成其功能源码审阅，因此不纳入已验证实现比较，也未复制代码。

## 一、选文菜单与浮钮

### 基线缺口

原实现只在少数固定时点计算位置。原生“向 ChatGPT 提问”浮窗在这些时点之后出现时，ChatFlow 不会再贴到旁边。按钮使用固定宽高，错误文案和大字体可能溢出；错误在 2.5 秒后消失；Escape 没有清理所有待执行回调。

### 实施

`src/tl-selection-action.js` 使用 3 秒临时观察器等待原生菜单，每 80 毫秒合并变化。通过实际边框尺寸选择左、右、上、下位置，再限制到视口内。原生菜单仅作为几何线索；按钮仍位于独立 Shadow DOM。

每个选区拥有独立状态。点击时复查 URL、页面 generation、文字、消息线索和 Range 首尾节点及偏移。新选区、Escape 和页面离开使旧状态失效。旧异步成功或失败不再关闭新按钮。失败状态持续显示，用户可以直接重试；新选区恢复正常文案。

此处没有复制 Threadmark 对 React 工具栏的修改，也没有引入 penciled 的整套批注或 Floating UI 依赖。

## 二、多窗口选文归属

### 审阅发现

基线 `cfPendingSelectedTask` 是全局单槽，多个已打开侧栏会监听同一条存储变化。领取没有绑定侧栏窗口。慢请求的失败清理还可能删除新请求；前端领取后刷新来源的等待期间，旧领取可能晚到覆盖新领取。以上是源码可构造的风险，不是已经观察到真实用户数据串入的事件记录。

### 实施

按浏览器窗口分别保存待接收选文，记录 window、tab、document、conversation、generation 和 nonce。打开侧栏仍发生在点击的用户激活时段内；校验成功后才写入待接收数据。

同窗口写入采用短队列和最新请求标记。新的明确选文立即使旧待领取值失效；较早请求的失败不会删除后来成功的选文。过期清理和确认消费只处理自己的 nonce。领取先核对窗口与精确页面，再检查是否已有较新请求，包括尚未写入的请求。

前端在刷新来源和用户确认之后再次核对同一 nonce；输入或来源手工改变会使旧领取失效。拒绝替换草稿时，文字与来源都保留。来源标签页关闭或切换对话时，旧草稿保留并要求重新选择来源，不会自动绑定到其他对话。手工编辑文字或来源也会取消尚未完成的自动来源刷新。

这项修复与任务结果的 CF 标记匹配互补，未改变结果归属规则，也没有代发消息。

## 三、导出中的引用来源

### 基线缺口

活跃归档内核只保留可见正文，未投影 `metadata.content_references`。研究回答中的引用可能在 Markdown、接续历史或上下文包中只剩内部标记，读者无法回到来源。

### 实施

正文 `text`、消息哈希和摘录偏移继续以原文为准。仅为助手可见正文存储最小 `sourceReferences`，包含明确匹配的标记、标题与 URL；不保存整份 metadata。

导出通过同一个 `exportMessageText` 入口生成标准链接。只处理同消息明确绑定、且位于代码外的引用。代码块、行内代码及未解析标记保留原样。无来源、冲突来源、不支持的部件不会被猜测替换或静默删掉。URI 只接受可解析的 HTTP(S) 来源，清除敏感签名查询参数。

归档恢复会检查最小结构并重新投影，防止来源在恢复时被静默丢失或更改。旧档案没有引用元数据时继续使用原文，不因新增功能把旧结构校验结果改成失败。Markdown / TXT 导出采用来源转换；JSON 保留原文与最小映射；上下文合并也把来源差异纳入版本比较。

本轮没有实现所有图表、图片轮播、实体卡片或私有来源的导出渲染，不把“支持网页引用”扩大表述为“支持所有回答部件”。

## 四、同名附件接续

### 基线缺口

实际上传文件已经会重命名，如第二份 `report.pdf` 改为 `2_report.pdf`。但历史只写原名，索引也没有对应消息与节点。同名文件来自不同轮次、甚至同一条消息时，接续模型缺少明确对应关系。

### 实施

历史附件引用保留稳定引用键，接续文件记录保留消息和节点。文件索引以“消息 + 节点 + 引用键 → 实际上传名 + 原名 + SHA-256”建立准确映射。历史分段文件名和索引文件名继续参与重名处理；同一字节被多条消息引用时，来源引用分别保留。

准备指纹增加格式标记，旧的已准备包不会被误复用为包含新映射的包。实际字节、哈希校验和上传状态仍沿用原机制。

## 五、导航与搜索的局部交互

本轮核对了 ChatFlow 已有的消息身份校验、可取消定位、滚动恢复与章节缓存。AI Chat TOC 和 ChatGPT Timeline 的已读路径，没有提供足以替换这些机制的优势；直接滚到某个相似 DOM 节点不能替代来源确认。

AI Chat TOC 的 SearchManager 在搜索框有文字时按 Escape 清空，空查询时失焦。ChatFlow 吸收“先清空搜索”的层级；结合自身浮窗，把空查询时的下一次 Escape 适配为关闭并恢复原焦点。输入法组字期间不触发这一操作，清空查询也会取消旧定位。这里没有把第二次关闭错误归为上游原有行为。

Timeline 通过 rAF 合并滚动事件，但 `computeActiveByScroll` 仍顺序读取消息几何位置，目录高亮又会自动 `scrollIntoView`。这能提供当前位置感，但直接移植可能增加长对话开销或打断用户浏览目录；本轮不引入。

源码审阅还发现两个独立于上游的优化候选：搜索结果列表只显示前 200 条，而前后按钮遍历全部命中；同一查询的命中范围与消息所属回合存在重复计算。这些未在本轮增加分页或输入合并，不把未经代表性场景验证的性能收益写为成果。当前显示上限与“请缩小搜索范围”的提示仍有效。

## 保留现实现的理由

1. 摘录定位：当前按对话、消息、节点、文本哈希、偏移及同消息上下文恢复；Threadmark 的整页最高分候选及 penciled 的模糊距离回退不更适合研究材料保真。
2. 附件确认：ContextBridge 某些路径采用全页面文件名前缀、子串或图像出现判定，MoveChat 存在空文件降级。都不能替换现有的精确输入区与肯定上传证据。
3. 任务交接：规则摘要器的“目标”“已完成”常来自截取或关键词推测，无法保证真实进度。现有用户明确任务、来源标记、结果保存与手工回传更直接。
4. 并行比较：多模型工具的自动广播和供应商登录调度适用于另一种产品目标。ChatFlow 的同材料、独立会话、手动发送和结果比较不需要因此改成自动模型代理。
5. 已有上游：thekester、MoveChat 的最新提交仍为现 pin；没有升级收益时不变更锁定版本。

## 验证

代码和自动验证全部在 GitHub 云端处理。本轮增加实际行为回归，覆盖：

- 原生菜单延迟出现、错误持续、按钮实际尺寸、Escape 与旧回调；
- 导航搜索 Escape 先清空再关闭、焦点与输入法组字处理；
- 旧请求迟到、两个窗口并存、旧 nonce 领取或确认、页面重载与来源 generation；
- 用户在异步领取期间编辑草稿、拒绝替换时来源保持、来源刷新后的显式新选文、来源标签关闭或导航与手工选择并发；
- 引用原文保留、代码中示例、未知标记、冲突绑定、敏感 URL、归档恢复和上下文去重；
- 重名附件、保留文件名冲突、同字节多来源、旧准备指纹失效。

新增真实 Chromium DOM 测试加载生产选文脚本，网络与消息返回使用合成输入。其结果存于 Actions 的 synthetic evidence。精确执行状态、提交 SHA 和候选 ZIP 哈希以本轮 PR 的检查和产物为准。

真实登录账号上的当前 ChatGPT 菜单、真实旧附件与独立真人体验仍需真实场景验收；合成测试通过不能替代这一层证据。
