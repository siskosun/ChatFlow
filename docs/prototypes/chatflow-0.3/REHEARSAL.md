# Rehearsal: ChatFlow 0.3

日期：2026-11-03。范围：静态交互原型、生产 UI 合成截图。

## Gold 与改动

Gold：Stageshow `examples/static-card`，原始画面保存在 [gold-static-card.png](gold-static-card.png)。保留 Stage、Window、Row 和紧凑排版的基础，改成 ChatFlow 的实际保存、接续、任务与备份功能。对比原例，ChatFlow 是可填写和点击的流程页，焦点从客户总额变为明确的下一步操作，内容密度随表单状态变化。

先完成 [PLAN.md](PLAN.md) 和原型，再调整 `workspace/`。原型包含首页、首次保存、保存完成、准备接续、接续已准备、交出任务、任务已复制、回传结果、结果已保存、备份等待十种可选择状态。状态切换供设计复看，不是自动循环动画。

## 拍摄与结果

| 画面 | 方法 | 结果 |
| --- | --- | --- |
| saved-light | Stageshow film，1100px，still、gate | rehearsal passed；[报告](saved-light.json) |
| saved-dark | Stageshow film，1100px，still、gate | rehearsal passed；[报告](saved-dark.json) |
| saved-compact | Stageshow film，390px，still、gate | rehearsal passed；[报告](saved-compact.json) |
| return-dark | Stageshow film，390px，still、gate | 两条 uneven-gutters 检测仍报告 issues；[报告](return-dark.json) |
| 生产四个主页面和实验页 | Chromium 截图，1100/390/320px，浅暗色 | 整页无横向溢出、无脚本错误 |
| 输入与错误状态 | 真实生产 JS、合成存储/API | 超长输入保留且阻止提交；有旧快照的失败采集突出重试 |

最终开发运行共有 32 项检查，记录在 [screenshots/visual-checks.json](screenshots/visual-checks.json)。原型画面不自动等同于生产页面通过；实施后单独拍摄并复看了生产保存完成、失败回退、任务与实验页面。

### 保留的 film 报告

`return-dark` 的首轮报告发现最近任务行的实际文字被底部裁切，已移除该完成状态中无关的最近任务区；重拍后不再报告文字裁切。

重拍仍报告：textarea 距表单左右各 17px、距表单底部 317px；来源区距左右各 17px、距底部 138px。已逐图复看 [return-dark.png](return-dark.png)：这两个元素是竖直表单中的输入区和来源区，下方依次是已保存状态、回传主按钮与发送提示。所有文字、边框和主操作都在画面内，控件两侧对齐。保留此表单顺序，不把内控件改成等边距的独立营销画框，也不隐藏元素来消除工具告警。

因此只声明保存完成的三个 still gate 通过，**不声明原型所有状态的 Stageshow gate 均通过**。紧凑画面是产品页面本身，不套用高窄的桌面浏览器窗。这个取舍以及剩余两项报告都保留供后续设计复核。

## 独立复核与响应

主开发者从保存完成截图指出：“继续这段对话”容易被理解为返回原聊天，而实际功能会准备材料并打开新聊天。对应修改：原型和生产主操作统一为“继续到新对话”；准备页分别使用“准备历史与文件”“打开新对话”，没有追加说明段弥补动作歧义。

实施复核还检查了暗色主按钮的文字与表面、实验页硬编码浅色背景、窄屏标签换行、失败状态的下一步。最后一次生产截图已包含次级备份入口、主题占位文字和失败时的重试按钮。这里的复核是开发者视觉审查，不代表首次用户已经理解。

## 假设与未检查项

- 原型中的对话、任务、文件、时间及数量均为合成示例；真实产品依旧从本地存储和已选择的对话获取数据。
- 保存与恢复可靠性依赖真实导出/恢复代码和专门回归，不从截图推断。浏览器发起下载不等于磁盘下载完成。
- 本原型没有动画循环；未检查循环接缝、逐 40–80ms 运动帧或 reduced-motion 动画行为。
- 本目录的文本超限检查使用程序填写，不证明真实系统粘贴行为；真实 Ctrl+V、MV3 生命周期等由正式浏览器回归单独记录。
- 未完成真实登录、独立用户、真人任务验收或屏幕阅读器等辅助技术测试。这些须在开发完成后按项目安排进行。
