"""Additional version-bound evidence assertions, on the existing installed-MV3 runner."""
import asyncio
import importlib.util
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('archive_runner', ROOT/'tests/archive_reliability_e2e.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
original = runner.CASES
extra = (ROOT/'tests/fixtures/evidence-cases.js').read_text(encoding='utf-8')
runner.CASES = 'async()=>{const original=await ('+original+')(); const evidence=await ('+extra+')(); return [...original,...evidence];}'
if __name__ == '__main__':
    asyncio.run(runner.main())
