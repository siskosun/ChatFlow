# ChatFlow 0.2 安装与更新

## 取得候选包

1. 打开 [ChatFlow PR #2](https://github.com/siskosun/ChatFlow/pull/1)，确认最新提交 SHA 和对应 GitHub Actions `verify`、`windows-baseline` 均通过。PR #2 是 0.2 候选；PR #1 是其 0.1 基线，二者均保持未合并。
2. 在该准确提交的成功 Actions 运行中下载 `chatflow-candidate-<SHA>` artifact。
3. 解压 artifact，确认包含 Chrome 与 Edge 候选 ZIP 及 `SHA256SUMS`。校验 ZIP 哈希；不要使用其他提交的旧 artifact。
4. 解压目标浏览器 ZIP，确认根目录直接包含 `manifest.json`、`workspace/`、`src/`、`BUILD_INFO.json`。

## Microsoft Edge

1. 建议先创建独立 Edge 配置文件，用于真实账号验收，避免与其他扩展数据混淆。
2. 打开 `edge://extensions/`。
3. 开启“开发人员模式”。
4. 选择“加载解压缩的扩展”，指向解压后的 `chatflow-edge-0.2-candidate/` 目录。
5. 确认扩展名称为 ChatFlow、版本为 0.2。打开一个普通 ChatGPT 对话，点击扩展图标或侧边栏入口。

## Google Chrome

1. 打开 `chrome://extensions/`。
2. 开启“开发者模式”。
3. 选择“加载已解压的扩展程序”，指向 `chatflow-chrome-0.2-candidate/` 目录。
4. 确认名称、版本和图标。打开普通 ChatGPT 对话后进入 ChatFlow。

## 更新

- 每次更新都重新下载与新提交 SHA 匹配的候选包。
- 在扩展管理页移除旧的 ChatFlow 候选，再加载新目录；不要删除浏览器配置文件中的扩展存储目录。
- 重新加载扩展可能重启 service worker。进行中的采集或并行分支可能转为 interrupted/unknown；不要自动重放。
- 旧 ThreadLine/研线扩展与 ChatFlow 使用不同扩展身份，ChatFlow 不会自动迁移旧扩展的 IndexedDB。需要时先在旧扩展导出 ZIP，再在 ChatFlow 中恢复。

## 数据与隐私

- 对话、附件和并行实验保存在当前浏览器配置文件的本地存储中。
- ZIP 和 JSON 导出文件包含用户选择的对话或实验材料，按敏感文件处理。
- 不将真实对话、附件、Cookie、Token、签名 URL 上传到 GitHub Issues、PR 或测试目录。
- 0.2 只对 ChatGPT 有生产适配器。其他模型平台目前显示为不支持，不应尝试绕过平台限制。

## 卸载

卸载扩展会使该浏览器配置文件中的本地档案和实验数据无法再由扩展读取。卸载前先导出并验证 ZIP/JSON 备份。