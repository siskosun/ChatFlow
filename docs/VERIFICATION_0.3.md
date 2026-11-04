> **历史工程验证记录。** 仅保留 2026-11-03 的准确 SHA 与当时的测试结论，不代表最新 main。PR #3 已于 2026-11-04 合并；最新代码应按 [main](https://github.com/siskosun/ChatFlow/tree/main) 和 [main CI](https://github.com/siskosun/ChatFlow/actions/workflows/verify.yml?query=branch%3Amain) 的提交 SHA 核对。真实账号及独立真人验收仍未执行。

# ChatFlow 0.3 工程验证记录

## 验证范围与版本

本记录对应运行代码提交 `b59fc3da1383ecdf29ea3416b05f847c4431217d`，验证日期为 2026-11-03。

- [源码 PR #3](https://github.com/siskosun/ChatFlow/pull/3)：当时保持 Draft；已于 2026-11-04 合并，但仍未创建正式 Release。
- [完整 GitHub Actions 运行 41675992976](https://github.com/siskosun/ChatFlow/actions/runs/41675992976)：Ubuntu 验证、Windows 基线、跨平台产物比较三个 job 全部成功。
- Node `v22.23.4`；实际 Chromium `141.0.7390.37`；Ubuntu 24.04 / Playwright 1.56.0。
- 浏览器测试安装真实 MV3 扩展，使用实际 IndexedDB 和合成页面、合成正文与附件。没有使用真实账号或真实用户资料。
- 本文与原始报告的归档提交只增加验证记录。后续候选包的准确源码提交以包内 `BUILD_INFO.json` 为准，并须匹配该提交的成功 CI；本记录不冒充其他提交的测试结果。

## 结果

| 验证类别 | 通过数量 | 证据 |
| --- | ---: | --- |
| Node 行为与安全回归 | 188 / 188 | 上述 CI 的 Ubuntu 与 Windows 测试步骤 |
| 原浏览器主流程 | 48 / 48 | [browser-report.json](verification/b59fc3d/browser-report.json) |
| IndexedDB 存储边界 | 17 / 17 | [storage-report.json](verification/b59fc3d/storage-report.json) |
| 任务派发、回传与导航 | 14 / 14 | [task-loop-report.json](verification/b59fc3d/task-loop-report.json) |
| 归档可靠性 | 5 / 5 | [archive-reliability-report.json](verification/b59fc3d/archive-reliability-report.json) |
| 任务库迁移、容量与完整性 | 9 / 9 | [task-storage-v4-report.json](verification/b59fc3d/task-storage-v4-report.json) |
| 来源锁定、真实粘贴事件与大库索引 | 11 / 11 | [reliability-report.json](verification/b59fc3d/reliability-report.json) |
| 界面与计算对比度 | 42 / 42 | [ui-visual-report.json](verification/b59fc3d/ui-visual-report.json) |
| 算法性能预算 | 4 / 4 | [performance-report.json](verification/b59fc3d/performance-report.json) |

功能和存储类浏览器用例合计 104 项；另有 42 项界面检查。所有用例没有通过放宽判定、隐藏失败或把未知状态改成成功来通过。

Ubuntu 与 Windows 生成的 Chrome ZIP、Edge ZIP 及 `SHA256SUMS` 逐字节一致。Actions 外层下载 ZIP 是上传服务包装，不作为扩展包一致性的比较对象。

## 四项数据可靠性修复

### 保存绑定用户点击时的来源

普通保存先冻结 tab、conversation、URL 与 documentId，在异步权限操作、写入和消息派发前后核对。页面切换到另一段对话或在相同 URL 重新加载，均拒绝沿用旧身份继续采集。停止操作与等待中的存储写入串行完成，避免已停止的采集恢复为运行中。

实际浏览器回归中，在 A 开始保存、权限等待期间切换到 B，显示持续错误，写入归档数量为 0，向 B 发出的采集请求为 0；相同 URL 重新加载返回 `SOURCE_DOCUMENT_CHANGED`。未改变来源的正向对照成功保存，并且只有“继续到新对话”为主操作。

### 成功导出的归档经过真实恢复解析器

`chatflow.archive/2` 将大附件拆成不超过 64 MiB 的 ZIP 条目。导出以存储快照读取一致的数据，生成 ZIP 后通过恢复使用的同一检查函数验证格式、引用与实际内容，检查过程不写数据库。应用版本读取运行时 manifest。

真实 IndexedDB 中的 65 MiB 附件（68,157,440 字节）导出为 64 MiB + 1 MiB 两个条目，立即恢复后长度与 SHA-256 一致。旧 ChatFlow/1 与 ThreadLine/1 归档继续支持导入。

归档解压后的累计数据仍限制为 256 MiB，元数据 JSON 上限为 32 MiB，并保留解压比等资源保护。超过支持范围会拒绝导出，而不是提供一个已知无法由当前恢复器读取的成功备份。导出检查证明当前版本的解析和完整性检查通过，不保证目标设备可用存储空间，也不保证文件下载后从未损坏。详见 [ARCHIVE_FORMAT.md](ARCHIVE_FORMAT.md)。

### 下载和实时采集期间不导出不稳定状态

采集中、实时缓存开启或附件仍下载时，导出以 `ARCHIVE_BUSY` 拒绝且不修改原数据。显式停止后，可导出静态的部分归档；恢复保留缺失附件状态，不制造空文件或把缺失标为成功。上述两条路径均已通过实际 IndexedDB 回归。

### 整库备份容量与任务库保持一致

新的 `chatflow.task-backup/2` 使用逐记录 JSONL，导出在一次只读快照中进行，读取采用有界分片；恢复先分批暂存、验证计数与完整性，最后用一次事务合并。每条记录、任务数量和结果数量仍有明确上限，损坏、重复冲突或超量均不会造成半份恢复。

- 16 份接近单条上限的结果，备份为 4,200,227 字节，实际导出、恢复并保留完整内容。
- 1,000 个任务与 2,000 份结果的代表性库，备份为 11,328,633 字节，完整恢复与分页通过。
- 第 2,001 份结果被明确拒绝，已有 2,000 份结果保持不变。
- 原有 v1 JSON 备份仍可导入；v1 文件读取保留旧格式的 4 MiB 边界，新整库导出不再受该边界限制。
- 检查已有回执的归属、内容和完整性后才复用；同哈希但不同原始文本不再静默合并。

这些测试覆盖数量上限和单条边界的组合，并未声称已在浏览器中写入 2,000 份全部达到最大尺寸的结果。详见 [TASK_LOOP.md](TASK_LOOP.md)。

## 界面、输入和版本

按要求先采用固定版本的 `benjitaylor/skills` Stageshow 绘制 [交互原型](prototypes/chatflow-0.3/index.html)，再对照状态实现。原型来源、许可与演练证据见 [原型说明](prototypes/chatflow-0.3/README.md) 和 [REHEARSAL.md](prototypes/chatflow-0.3/REHEARSAL.md)。原型的静态渲染证据与本次安装扩展后的 CI 证据分别保留；不能把两者当作真人理解测试。

保存完成后主操作为“继续到新对话”；接续分为“准备历史与文件”和“打开新对话”；失败时“重试保存”为主操作，错误持续可见。重新采集、备份和偏好设置降为次级操作。档案、任务和结果列表分页，并通过摘要索引避免列表读取完整正文。

移除会静默截断粘贴的输入 `maxlength`，保留完整原文，通过计数、错误状态与禁用动作提示超限。浏览器通过系统剪贴板触发可信粘贴事件，确认接续说明、上下文查询、任务内容、结果正文和实验输入五条路径的长度、尾部与哈希均未丢失；超限时动作被阻止。

实验页面使用统一主题变量，修复浅色文字对比度与主题切换期间按钮背景过渡造成的瞬时低对比度。42 项界面与计算对比度检查通过。安装说明、PR 指向、扩展版本和归档来源版本均更新为 0.3。

## 性能预算与测量边界

以下为本次云端 Node 22 合成算法测试，固定样本、三次独立调用的中位数，不代表用户电脑或真实浏览器的耗时。

| 用例 | 本次中位数 | CI 门槛 |
| --- | ---: | ---: |
| 50,000 节点宽分支规范化 | 413.30 ms | 2,000 ms |
| 50,000 节点链式规范化 | 451.06 ms | 2,000 ms |
| 1,198,081 字节快照编译 100 个重点片段 | 46.83 ms | 750 ms |
| 100 个来源、空片段选择 | 32.20 ms | 250 ms |

开发时另在同一云端 Node 24 环境保留了基线和优化结果：宽分支从 15,701.76 ms 降至 478.11 ms，100 个重点片段从 4,233.08 ms 降至 51.80 ms。基线仅运行一次，优化后取三次中位数，因此用于识别算法收益，不作为统计性能承诺；不得与本表 Node 22 测量混作同一次对照。原始报告见 [baseline](verification/development-performance-baseline.json) 和 [optimized](verification/development-performance-optimized.json)。

实际 Chromium / IndexedDB 的代表性合成大库：

| 用例 | 本次测量 | 门槛 |
| --- | --- | --- |
| 1,000 个档案，每份正文 32 KiB，分页 50 条 | 首次摘要页 2.4 ms；10 次取样页面 p95 15.2 ms | 首页 <1,500 ms；页面 p95 <500 ms |
| 1,000 任务 / 2,000 结果，分页 25 条 | 首次摘要页 4.2 ms；页面 p95 4.4 ms | 首页 <1,500 ms；页面 p95 <500 ms |
| 上述任务库恢复 | 3,295 ms | <60,000 ms |

分页耗时测量的是摘要查询，不是完整页面交互延迟。测试同时阻止列表路径读取原始正文存储，验证索引确实生效。真实用户大库及具体设备预算仍需后续测量。实现与预算说明见 [PERFORMANCE.md](PERFORMANCE.md)。

## 尚未执行的外部验收

工程回归完成之后，仍需按 [REAL_ACCOUNT_ACCEPTANCE.md](REAL_ACCOUNT_ACCEPTANCE.md) 执行：授权真实账号、真实历史资料与附件的恢复；实际个人大库；至少 5 名独立首次使用者在无额外解释下的操作辨识；真实辅助技术使用者的键盘与读屏验收。

当前未取得这些外部验证结果，不宣称正式可发布、真人体验通过或辅助技术兼容通过。Checkpoint 的相应节点保持 `blocked`。截图、计算对比度、合成页面及自动化剪贴板测试不能替代这些验收。
