# ChatFlow 代码与体验审查复核：接续回收、双草稿与容量阶段

审查基线：`b7b10424fea3388028bd1234c8fd94b7d5b4cd99`（PR #37 已合并）。
范围：2026-11-06 代码审查报告中的 M1–M4。下面区分真实运行问题与旧源码问题。

## M1：成立，原 blocked 清理分支恒不可达

- `src/tl-store.js` 原规则同时要求 `injection_blocked` 和无 `targetTabId`，正常错误路径始终保留目标 ID。
- 改为：从权限已授予的 `chrome.tabs.query({})` 获取当下标签页 ID；对 **超过 14 天** 的受阻记录，仅在确认原目标标签页不在时回收。无列表 / 查询错误即不删除受阻记录。
- **保留** `claimed`、`partial_injection`、绑定仍在的 `injection_blocked`。无目标的旧 `prepared` 可按龄清理。最后活动时间优先取 `reportedAt` / `retriedAt` / `createdAt`。
- 清理与共享文件哈希引用核对在 IndexedDB 同一事务内；删除后仍被其他接续或档案引用的 Blob 必须保留。
- 此逻辑按“有验证的目标关闭”回收，不代表可自动处理所有旧状态。若没有权限/无法可靠判断目标，宁可保留。

## M2：成立，后台拒绝双草稿风险

- `src/tl-inject.js` 在 `prefill()` 写入内容后、附件派发前仍可能抛错，此时 `attempted=false`，`injection_blocked` 可能携带未发送草稿。
- `tl:prepareHandoff` 的 `retryBlocked` 分支现在 **先检查旧 `targetTabId` 是否仍存在**，存在则返回 `HANDOFF_OLD_TARGET_STILL_OPEN`，且不会清除旧绑定。无法查询返回 `HANDOFF_TARGET_CHECK_UNAVAILABLE`。
- UI 明确要求先查看旧标签、保存所需内容并关闭旧标签，才允许再次准备。重复点击不自动发送，也不尝试清除网页草稿。
- 旧标签关闭后，只有相同 fingerprint、最新一条、受阻状态的接续允许按用户明确操作重置。同名文件/不同快照仍不得合并。

## M3：旧源码存在问题，但不是当前 Edge 扩展执行路径

- `src/background.js` 的 `cgx-fetch` 在读取响应时没有大小限制，这是旧代码的真实缺陷。
- 当前 `manifest.json` 的 service worker 指向 `src/tl-service.js`，不加载 `src/background.js`；`build.py` 有反向断言确保该文件 **不进入候选 ZIP**。
- 当前运行中的外部媒体下载使用 `tl-service.js` 的受限权限、截止时间及分块传输路径。不能把旧脚本问题当作当前扩展无限制读取的证据。
- 旧源码整理/迁移按独立低风险任务处理，避免混入接续状态机变更；旧脚本未来如重新启用，必须另审大小与解码预算。

## M4：需要口径清晰，但不能粗暴统一同一个数字

三个检查面向不同内容：

| 阶段 | 上限 | 说明 |
| --- | ---: | --- |
| 原始 ChatGPT 对话接口 JSON | 32 MiB | 未经规范化的数据，可能含传输元信息 |
| 规范化后入 IndexedDB 的快照 JSON | 24 MiB | 本地内存和存储的严格写入边界 |
| 历史 ZIP 中的 JSON 元数据与导入 | 32 MiB | 维持合法旧版归档的兼容性 |

- **不能推断** 24–32 MiB 原始 JSON 一定在快照阶段失败：原始字段可能被规范化删除；反之，规范化快照仍可能超过 24 MiB 而明确失败。
- 本修复在 `TLCore.BYTE_LIMITS` 统一命名，各模块使用同一个阶段口径；**没有提高快照上限，也没有缩小旧版 ZIP 导入上限**。超过对应边界仍会以既定安全错误码失败，不以截断替代完成。
- 真实大数据边界仍需验证 API 载荷和归档兼容性；仅靠数字一致不能证明安全或可用。

## 验收与局限

- 单元回归：旧目标存在时拒绝 retry、目标状态未知时拒绝清绑定、旧目标关闭后同 ID 恢复；三阶段上限及规范化前后体积差异。
- Chromium：真实扩展环境使用 `chrome.tabs.create/remove/query` 检查旧目标存活、阻断重试、关闭后恢复；IndexedDB 清理有目标存活和查询失败的反证。
- 仍不是登录真实 ChatGPT 的人工验收。用户提交的低优先级审查文本如未完整给出，不据此猜测并改动其余条目。
