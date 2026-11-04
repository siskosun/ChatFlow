/* Local evidence presentation. Text-only DOM, no second archive implementation. MIT. */
(() => {
  'use strict';
  const node = (tag, text) => { const el = document.createElement(tag); if (text != null) el.textContent = text; return el; };
  const localLabels = { ready: '完成', partial: '部分完成', error: '失败', capturing: '保存中', cancelled: '已取消', interrupted: '已中断' };
  function panel(view) {
    const report = TLEvidence.summary(view), section = node('section');
    section.id = 'archive-evidence'; section.setAttribute('aria-label', '保存与恢复核验');
    const local = node('p', '本地保存：' + (localLabels[report.local] || report.local) + (report.live ? '（实时缓存中）' : ''));
    local.dataset.evidence = 'local'; section.append(local);
    const labels = {
      backup: { not_executed: '未生成并核验该版本 ZIP', validated: '该版本 ZIP 已通过恢复解析校验', failed: '该版本最近一次 ZIP 生成或校验失败', stale: '仅有其他版本的 ZIP 核验记录' },
      restore: { not_executed: '未记录实际导入验证', validated: '本次导入已写库并读回验证', failed: '已导入，但读回验证未通过', stale: '仅有其他版本的实际恢复记录' }
    };
    for (const [kind, title] of [['backup','备份校验'],['restore','实际恢复']]) {
      const result = report[kind], row = node('p', title + '：' + labels[kind][result.state]);
      row.dataset.evidence = kind; row.dataset.state = result.state;
      if (result.state === 'failed') row.className = 'note';
      section.append(row);
      if (result.record) {
        const detail = node('details'), record = result.record;
        detail.append(node('summary', title + '记录'), node('pre', [
          '核验时间：' + record.at, '版本指纹：' + record.sourceKey,
          'ZIP SHA-256: ' + (record.zipSha256 || '未生成'),
          '运行版本：' + (record.build?.version || '未知'),
          '代码提交：' + (record.build?.sourceCommit || '未记录'), '结果码：' + record.code
        ].join('\n')));
        section.append(detail);
      }
    }
    const note = node('p', '校验仅针对记录中的具体版本和文件。不代表平台历史绝对完整，也不保证文件将来不会损坏。');
    note.className = 'hint'; section.append(note); return section;
  }
  globalThis.TLEvidenceUI = Object.freeze({ panel });
})();
