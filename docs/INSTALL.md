# ChatFlow 0.3 工程试用安装与更新

**未创建正式 Release；真实登录、独立用户和真人辅助技术验收尚未执行。** 这是工程候选版，而不是浏览器商店发布。

## 途径 A：直接加载 main 源码（地址固定，首次试用更容易）

1. 打开 [main 仓库](https://github.com/siskosun/ChatFlow/tree/main)，选择 **Code → Download ZIP**，解压后找到仓库根目录的 `manifest.json`；或使用 `git clone`。
2. 核对根目录有 `workspace/`、`src/`、`icons/`。旧弹窗已移到测试样本目录，现行入口是原生侧边栏。
3. Edge 打开 `edge://extensions/`（Chrome 是 `chrome://extensions/`），启用开发人员模式，选择“加载解压缩的扩展”，指向**直接包含 manifest.json 的仓库根目录**。
4. 在普通窗口登录 ChatGPT 并打开一段已有对话，点击工具栏上的 ChatFlow 图标打开侧边栏。
5. 查看 [main 最新提交 SHA](https://github.com/siskosun/ChatFlow/commits/main) 和 [main CI](https://github.com/siskosun/ChatFlow/actions/workflows/verify.yml?query=branch%3Amain)。源码加载不包含 BUILD_INFO.json，因此只是开发者试用，不等于附带构建校验的候选 ZIP。

## 途径 B：准确提交的可复现候选 ZIP

**当前已核验候选（2026-11-06）**：[下载 Edge + Chrome 双版本 artifact](https://github.com/siskosun/ChatFlow/actions/runs/42185621241/artifacts/13488335005)，对应 `main@aee60b30a5e4e3cae8a4749e7e2d76c6fd03aba8`。外层解压后分别选择 `chatflow-edge-0.3-candidate.zip` 或 `chatflow-chrome-0.3-candidate.zip`。这份附件对应固定提交，不会随着 main 后续更新自动变化。

1. 在 [GitHub Actions verify](https://github.com/siskosun/ChatFlow/actions/workflows/verify.yml?query=branch%3Amain) 选择 main 上 verify、windows-baseline、reproducible-build **全部通过**的运行，记录该运行的准确 SHA。
2. 下载 `chatflow-candidate-<SHA>` artifact。解压外层包，校验 SHA256SUMS，然后再解压其中的 Edge/Chrome 候选 ZIP。
3. 选择**内层**直接包含 manifest.json、workspace/、src/、BUILD_INFO.json 的目录加载，不要选 ZIP 文件或外层 artifact 文件夹。
4. 核对 BUILD_INFO.json 的 source_commit 与成功运行的提交 SHA 完全一致。

**Actions artifact 会过期**；[PR #3](https://github.com/siskosun/ChatFlow/pull/3) 已合并，旧 PR 附件不作为永久安装入口。目前没有 Release 下载地址，不应将候选版描述为已正式发布。
## Microsoft Edge：首次安装

1. 真实账号验收在工程开发完成后进行，首次测试建议使用独立 Edge 配置文件。
2. 打开 `edge://extensions/`，开启“开发人员模式”。
3. 选择“加载解压缩的扩展”，指向途径 A 的仓库根目录，或途径 B 的 Edge 内层 ZIP 解压目录。两者都必须直接包含 `manifest.json`。
4. 确认扩展名称为 ChatFlow、版本为 0.3。打开普通 ChatGPT 对话，点击扩展图标即可在 Edge 原生侧边栏打开 ChatFlow；ChatGPT 页面保持可见。

## Google Chrome：首次安装

1. 打开 `chrome://extensions/`，开启“开发者模式”。
2. 选择“加载已解压的扩展程序”，指向途径 A 的仓库根目录，或途径 B 的 Chrome 内层 ZIP 解压目录。
3. 确认名称、版本和图标。打开普通 ChatGPT 对话后点击 ChatFlow 图标，Chrome 原生侧边栏会在当前窗口中显示 ChatFlow。

## 侧边栏使用方式

点击浏览器工具栏的 ChatFlow 图标打开侧边栏。请先在普通窗口登录 ChatGPT，并打开一段已有对话；空白新聊天没有可保存的来源 ID。侧边栏与 ChatGPT 网页并排显示，不再新建全页面工作区。切换 ChatGPT 标签页时，侧边栏继续保留；保存和任务回传会检查选定的实际来源。接续到新对话会在同一浏览器窗口新建普通 ChatGPT 标签页，不自动发送。需要 Chrome 116+ 或支持原生扩展侧边栏的 Edge 版本。

## 保留已有数据的更新

更新前先停止采集，下载并校验已有对话 ZIP 和任务备份。记录当前扩展 ID 和加载目录。旧版存在“导出成功但超出恢复上限”的缺陷，尤其需要在独立测试配置验证旧 ZIP；不要卸载原扩展来试验恢复。

**不要把“卸载旧扩展再安装”当作普通更新步骤。** 保留当前浏览器配置、扩展身份及加载目录，将已核验的新包内容替换到原来的扩展目录，再在扩展管理页对原有 ChatFlow 点击“重新加载”。重新打开后核对扩展 ID、版本和本地档案是否仍在。

当前主分支使用 **IndexedDB v6**：保留此前 v4 的档案、任务、结果摘要索引与临时导入区；v5 修复旧 passage 索引，v6 为 `handoffs` 增加按 `captureId` 查找的索引。数据库升级通过原扩展身份下的事务迁移执行，不以卸载重装代替。若更换浏览器配置、扩展 ID 或安装路径导致旧库不可访问，应通过已校验的备份迁移；不要直接修改或删除浏览器内部存储文件。

重新加载会重启后台。进行中的采集或并行分支可能转为 interrupted/unknown，不自动重放不确定操作。旧 ThreadLine/研线扩展与 ChatFlow 身份不同，需要先在旧扩展导出，再在 ChatFlow 恢复；不能把更改数据库名称当成自动迁移。

## 数据、限制与隐私

- 对话、附件、重点片段和并行实验保存在当前浏览器配置的本地存储中。
- 对话 ZIP 使用 `chatflow.archive/2`：大附件分块，单 ZIP 条目最多 64 MiB，归档累计展开最多 256 MiB，deflate 压缩比最多 200。成功导出前会运行同版本的真实恢复校验；超总量或文件损坏会在下载前拒绝。65 MiB 单附件不再被单条目限制卡住。正在采集或下载时需先完成或停止；部分备份会保留缺失状态。
- 任务备份使用 `.jsonl`，支持当前任务库的 1,000 个任务与 2,000 份结果，不再限制新备份整库为 4 MiB。恢复先逐条校验，再一次合并。旧 `.json` 任务备份仍可导入。
- 导出校验确认格式与当前字节可恢复，不保证目标设备有足够配额，也不能防止下载后文件损坏。下载完成状态与导出校验分开显示。
- 重点片段单条最多 5000 个 UTF-16 字符，每份档案最多 5000 条；失效片段不会被伪装为已定位。
- 导出的 ZIP/JSON/JSONL 包含用户选定材料。不要提交真实对话、文件、Cookie、Token 或签名 URL 到公开仓库。
- 0.3 仅包含 ChatGPT 适配器。真实账号、真实大库、独立用户与真人辅助技术验收按开发完成后的阶段执行，不能用合成测试代替。

## 卸载

卸载前先导出并验证对话与任务备份。卸载、切换浏览器配置或更换扩展身份可能导致原本地存储不可再访问；不得依赖重新安装自动找回数据。
