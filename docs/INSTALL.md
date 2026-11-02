# ChatFlow 0.2 安装与更新

## 取得候选包

1. 打开 [ChatFlow PR #2](https://github.com/siskosun/ChatFlow/pull/2)，确认准确提交 SHA 和对应 GitHub Actions `verify`、`windows-baseline` 均通过。PR #2 是 0.2 候选，包含 PR #1 的 0.1 基线；工程候选不等于正式发布。
2. 在该准确提交的成功 Actions 运行中下载 `chatflow-candidate-<SHA>` artifact。
3. 解压 artifact，确认包含 Chrome 与 Edge 候选 ZIP 及 `SHA256SUMS`。校验 ZIP 哈希，不要混用其他提交的旧 artifact。
4. 解压目标浏览器 ZIP，确认根目录直接包含 `manifest.json`、`workspace/`、`src/`、`BUILD_INFO.json`，且 BUILD_INFO 的 source_commit 与已核验提交一致。

## Microsoft Edge：首次安装

1. 真实账号验收在工程开发完成后进行，首次测试建议使用独立 Edge 配置文件。
2. 打开 `edge://extensions/`，开启“开发人员模式”。
3. 选择“加载解压缩的扩展”，指向解压后的 `chatflow-edge-0.2-candidate/` 目录。
4. 确认扩展名称为 ChatFlow、版本为 0.2。打开一个普通 ChatGPT 对话，点击扩展图标或侧边栏入口。

## Google Chrome：首次安装

1. 打开 `chrome://extensions/`，开启“开发者模式”。
2. 选择“加载已解压的扩展程序”，指向 `chatflow-chrome-0.2-candidate/` 目录。
3. 确认名称、版本和图标。打开普通 ChatGPT 对话后进入 ChatFlow。

## 保留已有数据的更新

更新前先停止采集，导出并校验已有 ZIP/JSON 备份。记录当前扩展 ID 和加载目录。

**不要把“卸载旧扩展再安装”当作普通更新步骤。** 保留当前浏览器配置、扩展身份及加载目录，将已核验的新包内容替换到原来的扩展目录，再在扩展管理页对原有 ChatFlow 点击“重新加载”。重新打开后核对扩展 ID、版本和本地档案是否仍在。

0.2 的 IndexedDB v1→v2 升级只添加 passages 存储，不删除既有 captures、assets、files、chunks 或 handoffs。若更换了浏览器配置、扩展 ID 或安装路径而无法读取旧库，应通过已经校验的 ZIP/JSON 备份迁移，不操作或删除浏览器内部存储文件。

重新加载会重启后台。进行中的采集或并行分支可能转为 interrupted/unknown，不自动重放不确定操作。旧 ThreadLine/研线扩展与 ChatFlow 身份不同，需要先在旧扩展导出，再在 ChatFlow 恢复；不能把更改数据库名称当成自动迁移。

## 数据、限制与隐私

- 对话、附件、重点片段和并行实验保存在当前浏览器配置的本地存储中。
- 当前 ZIP 恢复限制为单条目 64 MiB、累计展开 256 MiB、deflate 压缩比不超过 200。超过限制的档案会被拒绝；能导出不表示当前版本能恢复任意大的 ZIP。
- 重点片段单条最多 5000 个 UTF-16 字符，每份档案最多 5000 条；失效片段不会被伪装为已定位。
- 导出的 ZIP/JSON 包含用户选定材料，按敏感文件处理。不要提交真实对话、文件、Cookie、Token 或签名 URL 到公开仓库。
- 0.2 仅包含 ChatGPT 适配器，尚未执行的真实账号、独立用户与真人辅助技术验收仍需单独完成。

## 卸载

卸载前先导出并验证 ZIP/JSON 备份。卸载、切换浏览器配置或更换扩展身份可能导致原本地存储不可再访问；不得依赖重新安装自动找回数据。
