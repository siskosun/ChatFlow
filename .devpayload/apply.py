"""One-shot source transport for the named feature branch; never a runtime component."""
import base64
import hashlib
import json
import lzma
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
REPOSITORY = 'siskosun/ChatFlow'
BRANCH = 'cf/complete-rollout-20261104'
BASE = 'dc30f51652e459a417401288a42d64026419565d'
DIGEST = 'a3c9ba8dd3a7b7829bf912eb1f5b8261f87c5e6d5f69f28f25f4449bf4c6fb61'
PATHS = '''.editorconfig
.gitignore
CONTRIBUTING.md
THIRD_PARTY_NOTICES.md
build.py
chatflow-0.3.tsm.history.jsonl
chatflow-0.3.tsm.json
docs/PLAN.md
docs/REVIEW_DISPOSITION_2026-11-04.md
manifest.json
package-lock.json
package.json
scripts/check-runtime.mjs
scripts/run-tests.mjs
src/tl-archive.js
src/tl-capture.js
src/tl-core.js
src/tl-diagnostics.js
src/tl-evidence.js
src/tl-inject.js
src/tl-navigation.js
src/tl-service.js
src/tl-store.js
src/tl-task-service.js
src/tl-tasks.js
src/tl-tools-page.js
src/toolkit-port.js
tests/page-reliability.test.mjs
tests/rollout-contracts.test.mjs
tests/rollout_e2e.py
tests/task-service.test.mjs
tests/task_storage_v4.py
workspace/app.js
workspace/experiments.js
workspace/flow.js
workspace/index.html'''.splitlines()

def run(*command):
    subprocess.run(command, check=True, cwd=ROOT)

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

assert os.environ.get('GITHUB_REPOSITORY') == REPOSITORY
assert os.environ.get('GITHUB_HEAD_REF') == BRANCH
assert len(PATHS) == len(set(PATHS)) == 36
run('git', 'merge-base', '--is-ancestor', BASE, 'HEAD')
encoded = ''.join((ROOT / f'.devpayload/part-{i:02d}.txt').read_text().strip() for i in range(4))
assert len(encoded) == 43072, 'TRANSPORT_LENGTH_MISMATCH'
compressed = base64.b64decode(encoded, validate=True)
decoder = lzma.LZMADecompressor(memlimit=128 * 1024 * 1024)
raw = decoder.decompress(compressed, max_length=1024 * 1024)
assert decoder.eof and not decoder.unused_data, 'TRANSPORT_DECOMPRESSION_LIMIT'
assert len(raw) == 198386 and digest(raw) == DIGEST, 'TRANSPORT_DIGEST_MISMATCH'
records = json.loads(raw)
assert len(records) == 36 and {record['path'] for record in records} == set(PATHS)
outputs = {}
for record in records:
    relative = record['path']
    assert relative in PATHS and '..' not in Path(relative).parts and not Path(relative).is_absolute()
    target = ROOT / relative
    assert not target.is_symlink()
    if record['before'] is None:
        assert not target.exists(), 'NEW_PATH_ALREADY_EXISTS:' + relative
        original = ''
    else:
        before = target.read_bytes()
        assert digest(before) == record['before'], 'SOURCE_CHANGED:' + relative
        original = before.decode('utf-8')
    last = 0
    for start, end, text in record['edits']:
        assert isinstance(start, int) and isinstance(end, int) and last <= start <= end <= len(original)
        assert isinstance(text, str)
        last = end
    result = original
    for start, end, text in reversed(record['edits']):
        result = result[:start] + text + result[end:]
    content = result.encode('utf-8')
    assert digest(content) == record['after'], 'OUTPUT_DIGEST_MISMATCH:' + relative
    outputs[target] = content
for target, content in outputs.items():
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
run('python', 'build.py')
run('npm', 'run', 'check')
run('npm', 'test')
run('node', 'tests/performance.mjs')
run('python', '-m', 'py_compile', 'tests/rollout_e2e.py', 'tests/task_storage_v4.py')
run('git', 'config', 'user.name', 'github-actions[bot]')
run('git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
run('git', 'add', '--', *PATHS)
run('git', 'commit', '-m', 'feat: complete bounded navigation, versioned evidence and per-file handoff; repair schema and dependencies')
# The checkout head is the expected ancestor; a concurrent update is rejected, not forced.
run('git', 'push', 'origin', 'HEAD:refs/heads/' + BRANCH)
print('SOURCE_APPLIED_CHECKED_FEATURE_BRANCH_ONLY', flush=True)
