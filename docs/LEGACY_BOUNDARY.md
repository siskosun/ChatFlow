# 历史源码与现行运行边界

ChatFlow 0.3 的实际运行入口由 manifest.json 指定：workspace/index.html 原生侧边栏、src/tl-service.js 后台和必要的内容脚本。build.py 只打包当前运行文件和依赖。

- tests/fixtures/legacy-popup/ 中旧 ChatGPT Export 的 popup.html 和 popup.js 只供 tests/a0-security.test.mjs 执行原有安全回归；**不会打入候选 ZIP，也不是现行插件的界面**。
- src/background.js、src/content.js、src/picker.js、src/render.js、src/zip.js 及 lib/ 属于历史迁移与测试参考，不在候选运行包里。直接通过 main 根目录加载源码时，它们虽存在于文件夹中，但 manifest 没有引用这些脚本。
- docs/VERIFICATION_0.3.md 记录旧提交的历史工程证据。现行版本应按 [main CI](https://github.com/siskosun/ChatFlow/actions/workflows/verify.yml?query=branch%3Amain) 的准确 SHA 检查。历史 ThreadLine 和 PR #1/#2 的数字不可冒充当前版测试结果。
- 尚无正式 Release：真实已登录环境、独立首次用户及真人辅助技术验收未完成。源码合并与自动化通过不等于正式发布。
