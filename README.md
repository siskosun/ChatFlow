# ChatFlow

**0.3 工程试用候选 · 本地优先 · 尚未通过真实账号及独立真人验收。** ChatFlow 是 Chrome/Edge 原生侧边栏扩展，可在本地保存 ChatGPT 对话与实际取得的文件，并由用户把材料接到新的聊天。扩展不会自动发送消息或向外部助手发起请求。当前只适配 ChatGPT。

## 立即试用：无需 Release

1. 打开 [main 源码](https://github.com/siskosun/ChatFlow/tree/main)，选择 **Code → Download ZIP**，解压后找到**根目录**的 `manifest.json`。也可 `git clone`。
2. Edge 打开 `edge://extensions/`（Chrome 用 `chrome://extensions/`），开启开发人员模式，点击**加载解压缩的扩展**，选择上述根目录。
3. 在普通窗口（非无痕）打开并登录 ChatGPT，进入一段**已有对话**，点击 ChatFlow 图标打开侧边栏。
4. 查看 [main 提交 SHA](https://github.com/siskosun/ChatFlow/commits/main) 和 [main CI](https://github.com/siskosun/ChatFlow/actions/workflows/verify.yml?query=branch%3Amain)。直接加载源码没有 `BUILD_INFO.json`，属于开发者试用，不等于已打包的可复现候选 ZIP。

需要带构建信息的 ZIP：从同一 SHA 的成功 Actions 运行中下载 `chatflow-candidate-<SHA>`，再解压其中的 Edge 或 Chrome ZIP。**Actions artifact 会过期，没有永久下载链接；正式 Release 尚未创建。** [完整安装与安全更新说明](docs/INSTALL.md)。

## 两项主功能

**保存并接到新对话**：保存已有对话与取得的附件，在本地核对后准备接续文件，打开新的普通 ChatGPT 标签页。由用户自行上传、核对与发送。

**任务回传**：为外部助手生成带来源标记的任务文本；由用户复制给外部助手，收到结果后粘贴回来。扩展只做本地保存与返回来源，不代发。

上下文包、重点片段和并行实验等放在高级功能中，按需启用。对话搜索、问题导航与 LaTeX 复制按需加载。参见 [任务回传](docs/TASK_LOOP.md) 和 [界面说明](docs/UI_0.3.md)。
## 核心流程

1. **打开侧边栏并保存对话**：在普通窗口登录 ChatGPT，打开一段已有对话，点击 ChatFlow 图标，在侧边栏确认来源、文件范围并保存。
2. **我的档案**：查找档案、检查消息/分支/附件完整性、导出或恢复 ZIP。
3. **继续到新对话**：选择需要的原始附件，生成接续包并在当前浏览器窗口打开新的普通聊天标签页。ChatFlow 只预填和附加文件，永不自动发送。
4. **创建上下文包**：从多份档案中筛选所选分支/全部可访问分支、完整消息或重点片段与关键词，按预算完整分段，输出来源清单和可选原始附件。档案详情中的“继续到新对话”也沿用所选分支，并记录来源哈希。
5. **重点片段**：在档案消息中选择并保存关键原文，保留消息/分支来源，支持高亮恢复、重新定位和按片段编译上下文。
6. **并行对照实验**：冻结同一份材料与任务，开启 2–4 个独立会话，逐个手动发送，采集结果后进行盲测比较与人工裁决。

## 重要边界

- 只采集用户明确选择的对话；实时缓存必须按单个对话明确开启。
- 只有实际非零文件字节通过校验后才显示已保存。
- 保存、ZIP 下载、附件上传和用户发送是不同状态。
- 不覆盖已有草稿，不对未知上传状态自动重试，不自动发送。
- 不删除或修改 ChatGPT 源对话和项目。
- 扩展图标打开浏览器原生侧边栏；接续和任务回源仍只在明确操作时打开或切换普通 ChatGPT 标签页。
- 本地数据保存在当前浏览器配置文件；ZIP 是独立备份。

## 开发状态

**版本：0.3 工程试用候选（未正式发布）。** 自动化通过不等于真实 ChatGPT 账号验收或真人 UX 验收通过。详见 [安装与更新](docs/INSTALL.md)、[0.3 工程验证](docs/VERIFICATION_0.3.md)、[变更记录](CHANGELOG.md)、[开发计划](docs/PLAN.md)、[档案格式](docs/ARCHIVE_FORMAT.md)、[Context Builder](docs/CONTEXT_BUILDER.md)、[并行实验说明](docs/EXPERIMENTS.md)、[Provider Adapter](docs/PROVIDER_ADAPTER.md) 和 [真实账号验收](docs/REAL_ACCOUNT_ACCEPTANCE.md)。

## 构建

需要 Python 3.12+（仅构建时）：`python build.py`。生成 Chrome/Edge 候选包、BUILD_INFO 和 SHA256SUMS。产品运行不需要 Python、Node、本地服务或云端后端。

## 隐私

不得将真实对话、附件、Cookie、Token、签名 URL 或内部资料提交到公开仓库。真实账号验收只记录脱敏结果。

## 备份可靠性

0.3 归档在导出成功前执行真实恢复解析与完整性校验。超过 64 MiB 的单附件会分块写入 ZIP；归档总展开上限仍为 256 MiB，超限在导出前拒绝。采集和下载未结束时不生成备份。静态部分档案保持缺失标记，不把下载进度当作文件字节。

任务库使用逐记录 `.jsonl` 备份，容量覆盖 1,000 个任务和 2,000 份结果；完整校验后才原子恢复。旧归档和旧任务 JSON 继续支持导入。目标设备配额和下载后损坏仍会影响恢复。

普通保存锁定所选对话和页面文档。异步等待中切换对话会停止该次保存，不把新页面归给旧来源。详细规则见[档案格式](docs/ARCHIVE_FORMAT.md)、[任务格式](docs/TASK_LOOP.md)与[性能预算](docs/PERFORMANCE.md)。

本版本仍为工程候选：真实已登录 ChatGPT、真实文件、5 名独立用户与辅助技术验收未完成。旧弹窗导出器已归档为测试样本，不属于当前插件入口；参见 [历史边界](docs/LEGACY_BOUNDARY.md)。
