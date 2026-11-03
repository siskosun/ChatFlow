# ChatFlow 0.3 界面原型与实施对照

打开 [index.html](index.html) 可查看自包含交互原型。顶部可切换 10 个流程状态及浅色、暗色；页面内按钮演示状态变化。原型只使用合成内容，不读取用户对话，也不实际保存、复制、返回或下载。

本原型先于本轮生产 UI 调整建立。设计计划见 [PLAN.md](PLAN.md)，逐帧检查、独立复核意见及限制见 [REHEARSAL.md](REHEARSAL.md)。

## 设计与实施

| 场景 | 主操作与后续结果 | 生产实施 |
| --- | --- | --- |
| 首次保存 | 选择来源后“保存对话” | 保留来源和文件范围；异步采集的来源锁定由服务验证 |
| 保存完成 | “继续到新对话”进入准备页 | 将继续按钮提升为主操作；重新采集、备份降为次操作 |
| 准备接续 | “准备历史与文件”，再“打开新对话” | 用按钮区分生成接续文件和打开新聊天 |
| 保存失败 | “重试保存” | 有旧快照时仍保留旧内容，隐藏不可用的继续操作 |
| 交出任务 | “复制任务”，完成后“回传结果” | 任务文本收进详情；后续操作位于结果状态下方 |
| 回传结果 | “保存结果”，再“复制结果并返回原对话” | 显示来源；结果在回传前校验；发送仍由用户完成 |
| 附件下载中 | “下载完成后可备份”禁用 | UI 状态和真实导出入口同时拒绝活动中的归档 |
| 部分文件不可用 | “备份已保存的内容” | 保留缺失记录，不称为完整备份 |
| 超长输入 | 保留全文，显示超限数量并阻止提交 | 不用原生 maxlength 静默截断 |
| 暗色 | 独立的表面、文字、按钮、提示与占位文字色 | 主工作区和实验页共同使用主题变量 |

原型用文件列表和最近保存列表帮助讨论功能；生产保存页保留数量摘要，完整文件和历史仍在“我的档案”。实施对照关注动作含义、主次顺序和状态，不把原型里的合成记录写入产品。

## 可复看的截图

- [原型：保存完成](saved-light.png)、[暗色](saved-dark.png)、[窄屏](saved-compact.png)
- [生产：保存完成](screenshots/production-capture-light-1100.png)、[暗色窄屏](screenshots/production-capture-dark-390.png)
- [生产：保存失败但保留旧快照](screenshots/production-capture-failed-dark-390.png)
- [生产：回传结果已保存](screenshots/production-return-saved-dark-320.png)
- [生产：实验页暗色](screenshots/production-experiments-dark-390.png)
- [完整开发截图与检查记录](screenshots/visual-checks.json)

`capture.mjs` 在 Chromium 中载入真实生产 HTML/CSS/JS，使用合成 Chrome API 响应和真实 IndexedDB。最终运行记录 32 项检查、0 个页面脚本错误：主工作区四页和实验页覆盖 1100、390、320 CSS px 与浅暗主题，未发现整页横向溢出；20,002 个 UTF-16 代码单元的任务输入完整保留并阻止提交；失败状态使用重试主操作。

这些是开发环境的合成视觉检查。输入检查使用 Playwright `fill`，不是系统剪贴板 Ctrl+V 测试；不是 MV3 安装、真实登录、真人、独立用户或辅助技术验收。正式扩展回归由仓库的测试与 GitHub CI 另行执行。

## 技能来源与实际使用

采用 [benjitaylor/skills · Stageshow](https://github.com/benjitaylor/skills/tree/802057409787133703c56001080169e347305572/stageshow)，固定提交 `802057409787133703c56001080169e347305572`；`SKILL.md` Git blob 为 `06293d95a1a3bedececd7a07e6cbb91f0910b8c6`。完整读取了技能说明及 `references/craft.md`、`framing.md`、`looks.md`、`rehearse.md`、`verify.md`、`review.md`、`teaching.md`，并读取所用组件的 `kit.md` 指导。

从 `examples/static-card` 开始，先渲染原例，再复制其 Stage、Window、Row 结构。按技能执行：先写设计计划；映射 ChatFlow 自身蓝灰变量；为宽屏和紧凑宽度分别布局；将视觉重量集中在下一步按钮；使用真实功能名称；先拍静帧、再独立复核，最后对照生产截图。未制作循环动画，因此不声称验证动画节奏或无障碍动态效果。

`vendor/stageshow` 仅保留本原型所需的 kit 依赖与原始 static-card 例子，入口 `kit/index.ts` 缩为所需导出。上游 MIT 许可和说明位于 [LICENSE](vendor/stageshow/LICENSE)、[NOTICE.md](vendor/stageshow/NOTICE.md)。没有安装全局技能。

## 本地重建

已生成的 `index.html` 可离线直接打开。要重建，先准备开发依赖：esbuild 0.25.12、React 18.3.1、React DOM 18.3.1。依赖可以放在仓库外；不加入扩展运行时。

```sh
npm install --prefix /tmp/chatflow-prototype-deps --no-save esbuild@0.25.12 react@18.3.1 react-dom@18.3.1 playwright-core@1.48.2
PROTOTYPE_NODE_MODULES=/tmp/chatflow-prototype-deps/node_modules node docs/prototypes/chatflow-0.3/build.mjs
PROTOTYPE_NODE_MODULES=/tmp/chatflow-prototype-deps/node_modules CHROME_PATH=/path/to/chrome node docs/prototypes/chatflow-0.3/capture.mjs
```

本次开发截图使用 Chromium 130.0.6723.31 和 Playwright Core 1.48.2，系统提供中文字体。截图脚本需要可运行的本地 Chromium；这不是仓库正式 CI 的版本约束。

原型自包含文件打包了 React 18.3.1、React DOM 18.3.1 及 Scheduler 0.23.2；完整 MIT 许可分别在 [REACT_LICENSE.txt](REACT_LICENSE.txt)、[REACT_DOM_LICENSE.txt](REACT_DOM_LICENSE.txt)、[SCHEDULER_LICENSE.txt](SCHEDULER_LICENSE.txt)。本目录只用于设计文档；候选扩展的显式文件清单不包含本目录、React 或 Stageshow。
