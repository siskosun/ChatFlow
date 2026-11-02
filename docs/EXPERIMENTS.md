# ChatFlow Parallel Experiments

并行对照实验是高级工作流，普通保存/接续主路径不显示复杂控制项。

## 操作契约

1. 用户提供共同材料 W0 与同一任务指令 P，并冻结为不可变快照及 SHA-256。
2. K 只能为 2–4。每个分支绑定独立 tab、attempt、operation ID 和 session identity。
3. 新建普通 ChatGPT 页面并预填完全相同的冻结文本；页面必须为空白、无草稿、无附件。
4. 用户逐个检查并手动发送。扩展不点击 Send，不自动重发。
5. 用户手动触发分支回复采集。只有准确输入、唯一任务、持久化完整快照、非空助手回复以及 API 完成标记同时满足时才标记 done。
6. 若浏览器/worker 重启导致绑定或采集证据丢失，状态转为 unknown；不重放不确定操作。
7. 所有分支完成后才允许生成去标签盲测映射；映射可复算，裁决前隐藏分支身份。
8. 人工裁决需要通过校准门禁，随后才揭盲并保存偏好、标准、置信度和说明。

## 状态与安全

- pending、done、failed、unknown 分开；UI 不能手动把分支标记 done。
- 分支窗口关闭、绑定丢失、目标页变化、采集不完整时不得伪造完成。
- 每个分支的结果必须绑定精确 conversation ID 和 attempt ID，迟到结果不能覆盖后续尝试。
- 发送与采集是不同动作。上传/预填成功不等于用户已发送，用户发送不等于助手回答完成。
- 实验数据保存在独立 IndexedDB 数据库，与普通档案库隔离；实验开关默认关闭。

## 复用来源

- ThreadLine Fork：冻结 W0/P、K=2–4、盲测/揭盲/裁决核心及隔离数据库。
- Panelize：request ID、动作回执、超时与失败分类原则；ChatFlow 不引入其不必要的外部运行时。
- ChatGPT 页面接续仍使用 MoveChat 式 File/DataTransfer 机制的安全子集；永不自动发送。

## 0.1 分支身份绑定与修复验收

预填完成 ACK 同时记录来源 tab、初始 documentId、origin 和 attempt。只有扩展在同一文档内观察到与冻结任务一致的可信人工点击 Send 或 Enter 事件才登记发送意图；这个动作**不是**服务器已收到消息的证明。该文档内第一次观察到的普通新聊天 `/c/<conversationId>` URL，被绑定为 attempt 的会话归属。

开始手动采集之前，必须确认来源 tab、documentId、conversationId、origin、attempt、发送意图和当前标签/页面 URL 全部一致。采集完成还要核对原始快照的来源身份、捕获文档和分支证据。跳转到另一个对话、重载文档或出现缺失身份，均进入 unknown，不自动重试、不伪装成 done。

ChatGPT 使用单页路由时，浏览器扩展消息携带的 MessageSender.url 可能仍指向初次加载的空白聊天页面，因此以当前标签 URL 识别当前会话，且保留发送方来源域、documentId 及所选会话的全部约束。合成测试通过不能替代真实登录环境下的会话创建与切换行为验收。
